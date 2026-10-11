import express from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// Aggregation edge for field agents — fans out to owning services with
// the caller's JWT forwarded verbatim. No read model here by design.
// The agent's id IS the IAM user id (req.jwt.sub) — never trusted from a body.

const app = express()
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
  ai: process.env.AI_URL || 'http://ai-agent',
}

// AI /parse document types → Billing evidence types.
const DOC_MAP = {
  e_wallet_receipt: 'E_WALLET', bank_deposit_slip: 'BANK_SLIP', check: 'BANK_CHECK',
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

async function get(url, req) {
  const r = await fetch(url, { headers: AUTH(req) })
  if (!r.ok) return null
  return r.json()
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

async function myExecutions(req, tenant, agentId) {
  const res = await get(`${SERVICES.field}/api/v1/tenants/${tenant}/executions?agent_id=${agentId}`, req)
  return res?.data ?? []
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'service-agent-bff' }))

// Agent home: my profile + open offers + active executions, one round trip.
app.get('/api/v1/agents/:agentId/home', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const { agentId } = req.params
  const [offersRes, executions, agent] = await Promise.all([
    get(`${SERVICES.dispatch}/api/v1/tenants/${t}/offers?agent_id=${agentId}`, req),
    get(`${SERVICES.field}/api/v1/tenants/${t}/executions?agent_id=${agentId}`, req),
    get(`${SERVICES.workforce}/api/v1/tenants/${t}/agents/${agentId}`, req),
  ])
  const offers = await Promise.all((offersRes?.data ?? []).map(async (o) => ({
    ...o, ...(await jobDetails(req, t, o.job_id)),
  })))
  res.json({ data: { agent, offers, executions } })
})

// The agent's job list — executions enriched with job + customer + address.
app.get('/api/v1/me/jobs', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const executions = await myExecutions(req, t, req.jwt.sub)
  const jobs = await Promise.all(executions.map((e) => enrich(req, t, e)))
  res.json({ data: jobs })
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
    body: JSON.stringify({ agent_id: req.jwt.sub }),
  })
  await proxy(res, r)
})

app.post('/api/v1/assignments/:id/reject', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(`${SERVICES.dispatch}/api/v1/tenants/${t}/assignments/${req.params.id}/reject`, {
    method: 'POST', headers: { ...AUTH(req), 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: req.jwt.sub }),
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
app.post('/api/v1/payment-evidence', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const { file_b64, filename, claimed, ...rest } = req.body ?? {}

  let parsed = null
  if (file_b64) {
    try {
      const fd = new FormData()
      fd.append('file', new Blob([Buffer.from(file_b64, 'base64')]), filename || 'receipt.jpg')
      const pr = await fetch(`${SERVICES.ai}/api/v1/parse`, { method: 'POST', body: fd })
      if (pr.ok) parsed = await pr.json()
    } catch { /* AI unreachable — degrade to claimed-only evidence */ }
  }

  const f = parsed?.fields ?? {}
  const payload = {
    ...rest,
    document_type: DOC_MAP[parsed?.document_type] ?? rest.document_type ?? 'OTHER',
    extracted: {
      reference: f.reference_no ?? f.check_no ?? f.po_number ?? f.merchant
        ?? claimed?.reference ?? rest.extracted?.reference ?? null,
      amount_cents: toCents(f.amount ?? f.total_amount)
        ?? claimed?.amount_cents ?? rest.extracted?.amount_cents ?? 0,
      channel: f.provider ?? f.merchant ?? rest.extracted?.channel ?? null,
      payer_name: f.sender ?? rest.extracted?.payer_name ?? null,
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

// Cash turn-in — the expected list and the counted submission, agent from JWT.
app.get('/api/v1/remittances/expected', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(
    `${SERVICES.billing}/api/v1/tenants/${t}/remittances/expected?agent_id=${req.jwt.sub}`,
    { headers: AUTH(req) })
  await proxy(res, r)
})

app.post('/api/v1/remittances/turn-ins', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(`${SERVICES.billing}/api/v1/tenants/${t}/remittances/turn-ins`, {
    method: 'POST', headers: { ...AUTH(req), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(req.body ?? {}), agent_id: req.jwt.sub }),
  })
  await proxy(res, r)
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`[bff] service-agent-bff :${port}`))
