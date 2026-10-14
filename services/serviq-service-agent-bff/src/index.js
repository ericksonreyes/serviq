import express from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// Aggregation edge for field agents — fans out to owning services with
// the caller's JWT forwarded verbatim. No read model here by design.
// Agent identity: the JWT sub is the IAM user id; domain rows (offers,
// executions, remittances) key on the workforce agents.id — resolved via
// the agents.user_id link. Never trusted from a body.
async function resolveAgentId(req, tenant) {
  const res = await get(`${SERVICES.workforce}/api/v1/tenants/${tenant}/agents?user_id=${req.jwt.sub}`, req)
  return res?.data?.[0]?.id ?? req.jwt.sub // fallback: pre-linkage identities
}

const app = express()

// Express 4 doesn't catch async rejections — route them to the error handler
// so one dropped upstream socket can't take the whole BFF down.
for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
  const orig = app[m].bind(app)
  app[m] = (path, ...handlers) => (typeof path === 'string' && handlers.length
    ? orig(path, ...handlers.map((h) => (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)))
    : orig(path, ...handlers))
}
app.use(express.json())
app.use((_req, res, next) => {
  res.set('Access-Control-Allow-Origin', _req.headers.origin || '*')
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Authorization,Content-Type')
  if (_req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})


const jwks = createRemoteJWKSet(
  new URL(process.env.JWT_JWKS_URL || 'http://identity-access-backend/.well-known/jwks.json'))
const AUTH = (req) => ({ Authorization: req.headers.authorization })

const SERVICES = {
  workforce: process.env.WORKFORCE_URL || 'http://workforce-backend',
  dispatch: process.env.DISPATCH_URL || 'http://assignment-dispatch-backend',
  field: process.env.FIELD_URL || 'http://field-service-backend',
  job: process.env.JOB_URL || 'http://service-job-backend',
  crm: process.env.CRM_URL || 'http://customer-request-backend',
  billing: process.env.BILLING_URL || 'http://billing-backend',
  ai: process.env.AI_URL || 'http://ai-agent:8000',
  platform: process.env.PLATFORM_MGMT_URL || 'http://platform-management-backend',
}

// Feature-flag probe — same contract as customer-portal-bff: public
// /v1/feature-flags/{key} on Platform Management, cached ~30s, fail-open
// (flag-store errors or missing flags mean enabled).
const flagCache = new Map()
async function flagEnabled(key, ttlMs = 30_000) {
  const hit = flagCache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  try {
    const r = await fetch(`${SERVICES.platform}/api/v1/feature-flags/${key}`)
    const value = r.status === 404 ? true : !!(await r.json()).data?.enabled
    flagCache.set(key, { value, expires: Date.now() + ttlMs })
    return value
  } catch {
    return hit ? hit.value : true
  }
}

// AI /parse document types → Billing evidence types.
const DOC_MAP = {
  e_wallet_receipt: 'E_WALLET', bank_deposit_slip: 'BANK_SLIP', remittance_receipt: 'REMITTANCE_RECEIPT', check: 'BANK_CHECK',
  pos_receipt: 'POS_RECEIPT', purchase_order: 'PURCHASE_ORDER', cash_photo: 'CASH_PHOTO',
}

const toCents = (v) => v === undefined || v === null || v === '' ? null
  : (Number.isInteger(v) && v > 10000 ? v : Math.round(Number(v) * 100))

async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { payload } = await jwtVerify(token, jwks, { issuer: 'serviq-iam', audience: 'serviq' })
    req.jwt = payload
    next()
  } catch {
    res.status(401).json({ message: 'Unauthenticated' })
  }
}

// Optional read: a non-2xx or an unreachable upstream both yield null, so
// enrichment degrades instead of failing the whole response.
async function get(url, req) {
  try {
    const r = await fetch(url, { headers: AUTH(req) })
    if (!r.ok) return null
    return await r.json()
  } catch (err) {
    console.error('[bff] upstream', url.split('?')[0], err.cause?.code ?? err.message)
    return null
  }
}

// Pass a proxy response through to the caller verbatim.
async function proxy(res, r) {
  const json = await r.json().catch(() => ({}))
  res.status(r.status).json(json)
}

// --- Job enrichment -------------------------------------------------------
// An agent's "job" = field execution (their work) + the job record (status,
// request link) + the request/customer (name, address, notes). One round
// trip each in parallel.

async function jobDetails(req, tenant, jobId) {
  const jobRes = jobId
    ? await get(`${SERVICES.job}/api/v1/tenants/${tenant}/jobs/${jobId}`, req)
    : null
  const job = jobRes?.data ?? jobRes
  const reqRes = job?.request_id
    ? await get(`${SERVICES.crm}/api/v1/tenants/${tenant}/requests/${job.request_id}`, req)
    : null
  const request = reqRes?.data ?? reqRes
  const customer = request?.customer ?? null
  const details = request?.details ?? {}
  return {
    job_status: job?.status ?? null,
    service_id: job?.service_id ?? request?.service_id ?? null,
    scheduled_for: details.scheduled_for ?? details.preferred_schedule ?? null,
    customer: customer ? { id: customer.id, name: customer.name, contact: customer.contact } : null,
    address: details.address ?? customer?.address ?? null,
    notes: details.notes ?? null,
  }
}

async function enrich(req, tenant, execution) {
  const details = await jobDetails(req, tenant, execution?.job_id)
  return {
    execution_id: execution.id,
    job_id: execution.job_id,
    assignment_id: execution.assignment_id,
    status: execution.status,
    checked_in_at: execution.checked_in_at ?? null,
    workflow_instance: execution.workflow_instance ?? [],
    created_at: execution.created_at ?? null,
    ...details,
  }
}

// Bounded fan-out: a long job list must not burst the 128MB backends.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function myExecutions(req, tenant, agentId) {
  const res = await get(`${SERVICES.field}/api/v1/tenants/${tenant}/executions?agent_id=${agentId}`, req)
  return res?.data ?? []
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'service-agent-bff' }))

// Agent home: my profile + open offers + active executions, one round trip.
app.get('/api/v1/agents/:agentId/home', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  // Callers pass the IAM user id (claims.sub); resolve to the workforce id.
  const agentId = await resolveAgentId(req, t)
  const [offersRes, executions, agent] = await Promise.all([
    get(`${SERVICES.dispatch}/api/v1/tenants/${t}/offers?agent_id=${agentId}`, req),
    get(`${SERVICES.field}/api/v1/tenants/${t}/executions?agent_id=${agentId}`, req),
    get(`${SERVICES.workforce}/api/v1/tenants/${t}/agents/${agentId}`, req),
  ])
  const offers = await mapLimit(offersRes?.data ?? [], 4, async (o) => ({
    ...o, ...(await jobDetails(req, t, o.job_id)),
  }))
  res.json({ data: { agent, offers, executions } })
})

// The agent's job list — executions enriched with job + customer + address.
// ?page=N forwards to the field-service paginator; the envelope's meta rides
// alongside the enriched rows so the client can page.
app.get('/api/v1/me/jobs', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const page = Number(req.query.page) || 1
  const env = await get(
    `${SERVICES.field}/api/v1/tenants/${t}/executions?agent_id=${await resolveAgentId(req, t)}&page=${page}`, req)
  const jobs = await mapLimit(env?.data ?? [], 4, (e) => enrich(req, t, e))
  res.json({ data: jobs, current_page: env?.current_page, last_page: env?.last_page, total: env?.total })
})

app.get('/api/v1/me/jobs/:id', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const execution = await get(`${SERVICES.field}/api/v1/tenants/${t}/executions/${req.params.id}`, req)
  const row = execution?.data ?? execution
  if (!row?.id) return res.status(404).json({ message: 'Not found' })
  res.json({ data: await enrich(req, t, row) })
})

// Assignment offers — agent_id always comes from the JWT.
app.post('/api/v1/assignments/:id/accept', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(`${SERVICES.dispatch}/api/v1/tenants/${t}/assignments/${req.params.id}/accept`, {
    method: 'POST', headers: { ...AUTH(req), 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: await resolveAgentId(req, t) }),
  })
  await proxy(res, r)
})

app.post('/api/v1/assignments/:id/reject', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(`${SERVICES.dispatch}/api/v1/tenants/${t}/assignments/${req.params.id}/reject`, {
    method: 'POST', headers: { ...AUTH(req), 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: await resolveAgentId(req, t) }),
  })
  await proxy(res, r)
})

// Open jobs pool — the self-assign strategy's job list. Populated only when
// the tenant rule is `self`; the strategy rides along so the client knows
// whether to render the section at all.
app.get('/api/v1/me/open-jobs', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const [rules, queue] = await Promise.all([
    get(`${SERVICES.dispatch}/api/v1/tenants/${t}/dispatch/rules`, req),
    get(`${SERVICES.dispatch}/api/v1/tenants/${t}/dispatch/queue`, req),
  ])
  const strategy = rules?.data?.strategy ?? 'automatic'
  const pool = strategy === 'self'
    ? await mapLimit((queue?.data ?? []).slice(0, 10), 4, async (j) => ({
        job_id: j.job_id,
        ...(await jobDetails(req, t, j.job_id)),
      }))
    : []
  res.json({ data: pool, strategy })
})

// Claim an open job — agent_id resolved from the JWT, never the body.
app.post('/api/v1/jobs/:jobId/claim', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(`${SERVICES.dispatch}/api/v1/tenants/${t}/dispatch/self-assign`, {
    method: 'POST', headers: { ...AUTH(req), 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: req.params.jobId, agent_id: await resolveAgentId(req, t) }),
  })
  await proxy(res, r)
})

// Execution lifecycle proxies.
app.post('/api/v1/executions/:id/check-in', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(`${SERVICES.field}/api/v1/tenants/${t}/executions/${req.params.id}/check-in`,
    { method: 'POST', headers: AUTH(req) })
  await proxy(res, r)
})

app.post('/api/v1/executions/:id/complete', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(`${SERVICES.field}/api/v1/tenants/${t}/executions/${req.params.id}/complete`,
    { method: 'POST', headers: AUTH(req) })
  await proxy(res, r)
})

// Step execution proxy — same call shape the agent UI needs.
app.post('/api/v1/executions/:id/steps/:position/:action', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(
    `${SERVICES.field}/api/v1/tenants/${t}/executions/${req.params.id}/steps/${req.params.position}/${req.params.action}`,
    { method: 'POST', headers: AUTH(req) })
  res.status(r.status).json(await r.json())
})

// Evidence — list, then intake. POST forwards multipart bodies untouched
// (raw stream, content-type preserved) and JSON bodies as JSON.
app.get('/api/v1/executions/:id/evidence', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(`${SERVICES.field}/api/v1/tenants/${t}/executions/${req.params.id}/evidence`,
    { headers: AUTH(req) })
  await proxy(res, r)
})

app.post('/api/v1/executions/:id/evidence', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const headers = { ...AUTH(req), 'Content-Type': req.headers['content-type'] || 'application/json' }
  const isJson = (req.headers['content-type'] || '').includes('application/json')
  const r = await fetch(`${SERVICES.field}/api/v1/tenants/${t}/executions/${req.params.id}/evidence`, {
    method: 'POST', headers,
    body: isJson ? JSON.stringify(req.body ?? {}) : req,
    ...(isJson ? {} : { duplex: 'half' }),
  })
  await proxy(res, r)
})

// Proof of payment — receipt file → AI parse → Billing evidence intake
// with both the parsed fields and the uploader's claimed values. Billing
// flags claimed-vs-parsed mismatches for manual review. Parse failure
// degrades to the claimed values alone (evidence still lands on record).
async function aiParse(fileB64, filename) {
  // `ai-agent` flag off → degrade to claimed-only evidence, same as a
  // parse failure — the flag is a capability gate, not an error path.
  if (!fileB64 || !(await flagEnabled('ai-agent'))) return null
  try {
    const fd = new FormData()
    fd.append('file', new Blob([Buffer.from(fileB64, 'base64')]), filename || 'receipt.jpg')
    const pr = await fetch(`${SERVICES.ai}/api/v1/parse`, { method: 'POST', body: fd })
    return pr.ok ? await pr.json() : null
  } catch { return null } // AI unreachable — degrade to claimed-only evidence
}

app.post('/api/v1/payment-evidence', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const { file_b64, filename, claimed, execution_id, invoice_id: _ignored, ...rest } = req.body ?? {}

  // The invoice is resolved from the agent's own execution — never taken
  // from the body, so an agent can't attach proof to someone else's bill.
  if (execution_id) {
    const found = await jobInvoice(req, t, execution_id)
    if (found.status) return res.status(found.status).json({ message: found.message })
    if (found.invoice?.id) rest.invoice_id = found.invoice.id
  }

  const parsed = await aiParse(file_b64, filename)

  const f = parsed?.fields ?? {}
  const payload = {
    ...rest,
    file_b64, filename, // Billing persists the artifact; file_ref becomes the object ref
    document_type: DOC_MAP[parsed?.document_type] ?? rest.document_type ?? 'OTHER',
    extracted: {
      reference: f.reference_no ?? f.check_no ?? f.po_number ?? f.merchant
        ?? claimed?.reference ?? rest.extracted?.reference ?? null,
      amount_cents: toCents(f.amount ?? f.total_amount)
        ?? claimed?.amount_cents ?? rest.extracted?.amount_cents ?? 0,
      channel: f.provider ?? f.bank ?? f.merchant ?? rest.extracted?.channel ?? null,
      payer_name: f.sender ?? rest.extracted?.payer_name ?? null,
      recipient_name: f.recipient_name ?? rest.extracted?.recipient_name ?? null,
      recipient_account: f.recipient_account ?? rest.extracted?.recipient_account ?? null,
      paid_at: f.deposit_date ?? f.date ?? rest.extracted?.paid_at ?? null,
    },
    claimed: claimed ?? null,
    confidence: parsed?.confidence ?? null,
    raw_text: parsed ? JSON.stringify(f) : (rest.raw_text ?? null),
  }

  const r = await fetch(`${SERVICES.billing}/api/v1/tenants/${t}/payment-evidence`, {
    method: 'POST', headers: { ...AUTH(req), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  await proxy(res, r)
})

// Cash collection on a completed job — Billing owns the payment; the BFF
// only resolves the job's invoice and checks the caller is its agent.
async function jobInvoice(req, t, executionId) {
  const ex = await get(`${SERVICES.field}/api/v1/tenants/${t}/executions/${executionId}`, req)
  const execution = ex?.data ?? ex
  if (!execution?.id) return { status: 404, message: 'Job not found' }
  if (execution.agent_id !== await resolveAgentId(req, t)) return { status: 403, message: 'This job is assigned to another agent' }
  const inv = await get(`${SERVICES.billing}/api/v1/tenants/${t}/invoices?job_id=${execution.job_id}`, req)
  return { execution, invoice: inv?.data?.[0] ?? null }
}

app.get('/api/v1/executions/:id/invoice', auth, async (req, res) => {
  const r = await jobInvoice(req, req.jwt.tenant_id, req.params.id)
  if (r.status) return res.status(r.status).json({ message: r.message })
  res.json({ data: r.invoice })
})

app.post('/api/v1/executions/:id/cash-collected', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await jobInvoice(req, t, req.params.id)
  if (r.status) return res.status(r.status).json({ message: r.message })
  if (r.execution.status !== 'completed') return res.status(409).json({ message: 'Complete the job before recording payment' })
  if (!r.invoice) return res.status(409).json({ message: 'Invoice not issued yet — try again in a moment' })
  const pay = await fetch(`${SERVICES.billing}/api/v1/tenants/${t}/invoices/${r.invoice.id}/pay`, {
    method: 'POST', headers: { ...AUTH(req), 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'cash' }),
  })
  await proxy(res, pay)
})

// Cash turn-in — the expected list and the counted submission, agent from JWT.
app.get('/api/v1/remittances/expected', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(
    `${SERVICES.billing}/api/v1/tenants/${t}/remittances/expected?agent_id=${await resolveAgentId(req, t)}`,
    { headers: AUTH(req) })
  await proxy(res, r)
})

app.post('/api/v1/remittances/turn-ins', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(`${SERVICES.billing}/api/v1/tenants/${t}/remittances/turn-ins`, {
    method: 'POST', headers: { ...AUTH(req), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(req.body ?? {}), agent_id: await resolveAgentId(req, t) }),
  })
  await proxy(res, r)
})

// Over-the-counter cash deposit (bank or remittance center): the AI Agent
// parses amount + reference off the slip; Billing validates it as a
// deposit batch over the agent's own pending cash collections.
const DEPOSIT_TYPES = ['BANK_SLIP', 'REMITTANCE_RECEIPT']
app.post('/api/v1/remittances/deposits', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const { file_b64, filename, document_type, invoice_ids, claimed } = req.body ?? {}
  if (!DEPOSIT_TYPES.includes(document_type)) return res.status(422).json({ message: 'Choose a bank deposit slip or a remittance-center receipt' })
  if (!file_b64) return res.status(422).json({ message: 'Attach a photo of the slip' })
  if (!Array.isArray(invoice_ids) || invoice_ids.length === 0) return res.status(422).json({ message: 'Select the cash collections this deposit covers' })

  const agentId = await resolveAgentId(req, t)
  const expected = await get(`${SERVICES.billing}/api/v1/tenants/${t}/remittances/expected?agent_id=${agentId}`, req)
  const mine = new Set((expected?.data?.collections ?? []).map((i) => i.id))
  if (invoice_ids.some((id) => !mine.has(id))) return res.status(403).json({ message: 'Only your own pending cash collections can be covered' })

  const parsed = await aiParse(file_b64, filename)
  const f = parsed?.fields ?? {}
  const headers = { ...AUTH(req), 'Content-Type': 'application/json' }
  const ev = await fetch(`${SERVICES.billing}/api/v1/tenants/${t}/payment-evidence`, {
    method: 'POST', headers,
    body: JSON.stringify({
      document_type,
      file_b64, filename, // Billing persists the artifact; file_ref becomes the object ref
      extracted: {
        reference: f.reference_no ?? claimed?.reference ?? null,
        amount_cents: toCents(f.amount ?? f.deposited_amount) ?? claimed?.amount_cents ?? 0,
        channel: f.provider ?? f.bank ?? null,
        paid_at: f.deposit_date ?? f.date ?? null,
      },
      claimed: claimed ?? null,
      confidence: parsed?.confidence ?? null,
      raw_text: parsed ? JSON.stringify(f) : null,
    }),
  })
  const evidence = await ev.json().catch(() => ({}))
  if (!ev.ok) return res.status(ev.status).json(evidence)

  const batch = await fetch(`${SERVICES.billing}/api/v1/tenants/${t}/remittances/batches`, {
    method: 'POST', headers, body: JSON.stringify({ evidence_id: evidence.data.id, invoice_ids }),
  })
  const body = await batch.json().catch(() => ({}))
  res.status(batch.status).json(batch.ok ? { data: { evidence: evidence.data, remittance: body.data } } : body)
})

// External-transfer turn-in (ADR-0026/0027): the agent settles held
// collections through an outside rail — e-wallet send, bank deposit, or a
// remittance center — and the receipt is the claim. AI parses amount +
// reference; Billing compares against all agent-held collections.
const TURN_IN_RAILS = { wallet: 'E_WALLET', bank: 'BANK_SLIP', remittance_center: 'REMITTANCE_RECEIPT' }
app.post('/api/v1/remittances/wallet-turn-ins', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const { file_b64, filename, claimed, channel = 'wallet' } = req.body ?? {}
  const docType = TURN_IN_RAILS[channel]
  if (!docType) return res.status(422).json({ message: 'channel must be wallet, bank, or remittance_center' })
  if (!file_b64) return res.status(422).json({ message: 'Attach a photo of the transfer receipt' })

  const parsed = await aiParse(file_b64, filename)
  const f = parsed?.fields ?? {}
  const headers = { ...AUTH(req), 'Content-Type': 'application/json' }
  const ev = await fetch(`${SERVICES.billing}/api/v1/tenants/${t}/payment-evidence`, {
    method: 'POST', headers,
    body: JSON.stringify({
      document_type: docType,
      file_b64, filename, // Billing persists the artifact; file_ref becomes the object ref
      extracted: {
        reference: f.reference_no ?? claimed?.reference ?? null,
        amount_cents: toCents(f.amount) ?? claimed?.amount_cents ?? 0,
        channel: f.provider ?? f.bank ?? null,
        payer_name: f.sender ?? null,
        recipient_name: f.recipient_name ?? null,
        recipient_account: f.recipient_account ?? null,
        paid_at: f.date ?? f.deposit_date ?? null,
      },
      claimed: claimed ?? null,
      confidence: parsed?.confidence ?? null,
      raw_text: parsed ? JSON.stringify(f) : null,
    }),
  })
  const evidence = await ev.json().catch(() => ({}))
  if (!ev.ok) return res.status(ev.status).json(evidence)

  const turnIn = await fetch(`${SERVICES.billing}/api/v1/tenants/${t}/remittances/turn-ins`, {
    method: 'POST', headers,
    body: JSON.stringify({
      agent_id: await resolveAgentId(req, t),
      channel, evidence_id: evidence.data.id,
    }),
  })
  const body = await turnIn.json().catch(() => ({}))
  res.status(turnIn.status).json(turnIn.ok ? { data: { evidence: evidence.data, remittance: body.data } } : body)
})

app.use((err, req, res, _next) => {
  console.error('[bff]', req.method, req.path, err.message)
  res.status(502).json({ message: 'A backing service is unavailable — try again shortly' })
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`[bff] service-agent-bff :${port}`))
