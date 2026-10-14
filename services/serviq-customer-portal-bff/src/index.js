import express from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { MongoClient } from 'mongodb'

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

const SERVICES = {
  crm: process.env.CRM_URL || 'http://customer-request-backend',
  catalog: process.env.SERVICE_MGMT_URL || 'http://service-management-backend',
  notifications: process.env.NOTIFICATION_URL || 'http://notification-backend',
  ai: process.env.AI_AGENT_URL || 'http://ai-agent:8000',
  platform: process.env.PLATFORM_MGMT_URL || 'http://platform-management-backend',
}

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

// Proxied call to an owning context — the caller's JWT forwards verbatim
// and the upstream status/body pass straight back.
async function upstream(req, res, base, path, { method = 'GET', body } = {}) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: req.headers.authorization,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const json = await r.json().catch(() => ({}))
  res.status(r.status).json(json)
  return { status: r.status, json }
}

const notFound = (res) => res.status(404).json({ message: 'Not found' })

// Read side only — projection runs in the dedicated -consumer container.
const mongo = new MongoClient(process.env.MONGODB_URI || 'mongodb://mongo:27017/serviq_portal')
await mongo.connect()
const db = mongo.db()

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'customer-portal-bff' }))

// Feature-flag gate — Platform Management owns the flag store and exposes
// a public /v1/feature-flags/{key} probe. Cached briefly so requests don't
// round-trip; fail-open on errors or unknown keys (a flag-store outage must
// not take the portal down with it).
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

// `customer-portal` is the portal kill-switch — 503 the whole API surface
// (health excluded) while it is off.
async function portalGate(req, res, next) {
  if (await flagEnabled('customer-portal')) return next()
  res.status(503).json({ error: 'maintenance', message: 'The customer portal is temporarily unavailable.' })
}
app.use('/api/v1', portalGate)

// The caller's CRM customer record — resolved from the IAM sub. null
// means "no profile yet" (first sign-in / not yet provisioned).
async function resolveCustomer(req) {
  const t = req.jwt.tenant_id
  if (!t) return null
  const r = await fetch(`${SERVICES.crm}/api/v1/tenants/${t}/customers/by-user/${req.jwt.sub}`,
    { headers: { Authorization: req.headers.authorization } })
  if (!r.ok) return null
  const json = await r.json().catch(() => ({}))
  return json.data || null
}

async function ensureCustomer(req, res) {
  const customer = await resolveCustomer(req)
  if (!customer) res.status(409).json({ message: 'Complete your profile first' })
  return customer
}

// --- Catalog (Service Management) -------------------------------------

app.get('/api/v1/catalog', auth, (req, res) =>
  upstream(req, res, SERVICES.catalog, `/api/v1/tenants/${req.jwt.tenant_id}/services`))

app.get('/api/v1/catalog/:service', auth, (req, res) =>
  upstream(req, res, SERVICES.catalog, `/api/v1/tenants/${req.jwt.tenant_id}/services/${req.params.service}`))

app.get('/api/v1/catalog/:service/availability', auth, (req, res) => {
  const qs = new URLSearchParams(req.query).toString()
  return upstream(req, res, SERVICES.catalog,
    `/api/v1/tenants/${req.jwt.tenant_id}/services/${req.params.service}/availability${qs ? `?${qs}` : ''}`)
})

app.get('/api/v1/catalog/:service/pricing', auth, (req, res) =>
  upstream(req, res, SERVICES.catalog, `/api/v1/tenants/${req.jwt.tenant_id}/services/${req.params.service}/pricing`))

// Business info for the booking page — weekly hours + upcoming closures.
app.get('/api/v1/operations', auth, (req, res) =>
  upstream(req, res, SERVICES.catalog, `/api/v1/tenants/${req.jwt.tenant_id}/operations`))

// --- Locations + coverage (Service Management) --------------------------
// Reference hierarchy + the coverage probe — powers the booking
// address cascade and early "outside service area" feedback.

app.get('/api/v1/locations/roots', auth, (req, res) =>
  upstream(req, res, SERVICES.catalog, '/api/v1/locations/roots'))

app.get('/api/v1/locations/search', auth, (req, res) => {
  const qs = new URLSearchParams(req.query).toString()
  return upstream(req, res, SERVICES.catalog, `/api/v1/locations/search${qs ? `?${qs}` : ''}`)
})

app.get('/api/v1/locations/:code/children', auth, (req, res) =>
  upstream(req, res, SERVICES.catalog, `/api/v1/locations/${req.params.code}/children`))

app.get('/api/v1/locations/:code', auth, (req, res) =>
  upstream(req, res, SERVICES.catalog, `/api/v1/locations/${req.params.code}`))

app.get('/api/v1/coverage/check', auth, (req, res) => {
  const qs = new URLSearchParams(req.query).toString()
  return upstream(req, res, SERVICES.catalog,
    `/api/v1/tenants/${req.jwt.tenant_id}/coverage/check${qs ? `?${qs}` : ''}`)
})

// "I'm interested" — demand signal from rejected bookings.
app.post('/api/v1/coverage/interest', auth, (req, res) =>
  upstream(req, res, SERVICES.catalog,
    `/api/v1/tenants/${req.jwt.tenant_id}/coverage/interest`, { method: 'POST', body: req.body }))

// --- Profile + address book (Customer & Request Management) -----------

app.get('/api/v1/me/profile', auth, async (req, res) => {
  const customer = await resolveCustomer(req)
  if (!customer) return notFound(res)
  res.json({ data: customer })
})

// First sign-in / self-signup path: provisions the CRM customer record
// for the caller's IAM user. Idempotent — an existing record wins.
app.post('/api/v1/me/profile', auth, async (req, res) => {
  const existing = await resolveCustomer(req)
  if (existing) return res.json({ data: existing })
  if (!req.jwt.tenant_id) return res.status(400).json({ message: 'No tenant scope on this token' })
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(422).json({ message: 'name is required' })
  const { status, json } = await upstream(req, res, SERVICES.crm, '/api/v1/customers', {
    method: 'POST',
    body: {
      tenant_id: req.jwt.tenant_id,
      user_id: req.jwt.sub,
      name,
      contact: req.body?.contact,
      address: req.body?.address,
    },
  })
  return { status, json }
})

app.patch('/api/v1/me/profile', auth, async (req, res) => {
  const customer = await ensureCustomer(req, res)
  if (!customer) return
  return upstream(req, res, SERVICES.crm,
    `/api/v1/tenants/${req.jwt.tenant_id}/customers/${customer.id}`, { method: 'PATCH', body: req.body })
})

app.get('/api/v1/me/addresses', auth, async (req, res) => {
  const customer = await ensureCustomer(req, res)
  if (!customer) return
  return upstream(req, res, SERVICES.crm,
    `/api/v1/tenants/${req.jwt.tenant_id}/customers/${customer.id}/addresses`)
})

app.post('/api/v1/me/addresses', auth, async (req, res) => {
  const customer = await ensureCustomer(req, res)
  if (!customer) return
  return upstream(req, res, SERVICES.crm,
    `/api/v1/tenants/${req.jwt.tenant_id}/customers/${customer.id}/addresses`, { method: 'POST', body: req.body })
})

app.patch('/api/v1/me/addresses/:id', auth, async (req, res) => {
  const customer = await ensureCustomer(req, res)
  if (!customer) return
  return upstream(req, res, SERVICES.crm,
    `/api/v1/tenants/${req.jwt.tenant_id}/customers/${customer.id}/addresses/${req.params.id}`,
    { method: 'PATCH', body: req.body })
})

app.delete('/api/v1/me/addresses/:id', auth, async (req, res) => {
  const customer = await ensureCustomer(req, res)
  if (!customer) return
  return upstream(req, res, SERVICES.crm,
    `/api/v1/tenants/${req.jwt.tenant_id}/customers/${customer.id}/addresses/${req.params.id}`,
    { method: 'DELETE' })
})

// --- Requests + jobs ---------------------------------------------------

// Customer-facing reads — tenant-scoped read model, filtered to the
// caller's customer record.
app.get('/api/v1/me/requests', auth, async (req, res) => {
  const customer = await resolveCustomer(req)
  if (!customer) return res.json({ data: [] })
  res.json({ data: await db.collection('portal_requests')
    .find({ tenant_id: req.jwt.tenant_id, customer_id: customer.id }).sort({ _id: -1 }).limit(50).toArray() })
})

app.post('/api/v1/me/requests', auth, async (req, res) => {
  const customer = await ensureCustomer(req, res)
  if (!customer) return
  return upstream(req, res, SERVICES.crm, '/api/v1/requests', {
    method: 'POST',
    body: {
      ...req.body,
      tenant_id: req.jwt.tenant_id,
      customer_id: customer.id,
    },
  })
})

// Command-side detail first; the read model fills in the linked job and
// its live status for the tracking timeline.
app.get('/api/v1/me/requests/:id', auth, async (req, res) => {
  const customer = await resolveCustomer(req)
  if (!customer) return notFound(res)
  const t = req.jwt.tenant_id

  const r = await fetch(`${SERVICES.crm}/api/v1/tenants/${t}/requests/${req.params.id}`,
    { headers: { Authorization: req.headers.authorization } })
  const json = await r.json().catch(() => ({}))
  let request = r.ok ? json.data : null
  if (!request || request.customer_id !== customer.id) return notFound(res)

  const projection = await db.collection('portal_requests').findOne({ _id: req.params.id, tenant_id: t })
  const jobId = projection?.job_id
  const job = jobId
    ? await db.collection('portal_jobs').findOne({ _id: jobId, tenant_id: t })
    : await db.collection('portal_jobs').findOne({ request_id: req.params.id, tenant_id: t })

  res.json({ data: { ...request, job: job || null } })
})

app.get('/api/v1/me/jobs', auth, async (req, res) => {
  const customer = await resolveCustomer(req)
  if (!customer) return res.json({ data: [] })
  res.json({ data: await db.collection('portal_jobs')
    .find({ tenant_id: req.jwt.tenant_id, customer_id: customer.id }).sort({ _id: -1 }).limit(50).toArray() })
})

app.get('/api/v1/me/jobs/:id', auth, async (req, res) => {
  const customer = await resolveCustomer(req)
  if (!customer) return notFound(res)
  const doc = await db.collection('portal_jobs')
    .findOne({ _id: req.params.id, tenant_id: req.jwt.tenant_id, customer_id: customer.id })
  if (!doc) return notFound(res)
  res.json({ data: doc })
})

app.post('/api/v1/me/requests/:id/feedback', auth, async (req, res) => {
  const customer = await ensureCustomer(req, res)
  if (!customer) return
  return upstream(req, res, SERVICES.crm,
    `/api/v1/tenants/${req.jwt.tenant_id}/requests/${req.params.id}/feedback`,
    { method: 'POST', body: req.body })
})

app.post('/api/v1/me/requests/:id/cancel', auth, async (req, res) => {
  const customer = await ensureCustomer(req, res)
  if (!customer) return
  return upstream(req, res, SERVICES.crm,
    `/api/v1/tenants/${req.jwt.tenant_id}/requests/${req.params.id}/cancel`,
    { method: 'POST', body: req.body || {} })
})

// --- Notifications (Notification service) ------------------------------

// The upstream feed is tenant-wide; the customer only gets rows addressed
// to them, so the BFF injects user_id server-side (tenant-wide rows with no
// user_id are staff traffic and must not leak). Notifications address the
// caller by either of their two identities — CRM customer id (domain events)
// or IAM sub (user-level events like CoverageSatisfied) — so both go up.
// Caller-controlled params are whitelisted to page/unread — user_id can
// never come from the query.
app.get('/api/v1/me/notifications', auth, async (req, res) => {
  const customer = await resolveCustomer(req)
  const ids = [...new Set([customer?.id, req.jwt.sub].filter(Boolean))]
  if (!ids.length) return res.json({ data: [], total: 0 })
  const qs = new URLSearchParams()
  if (req.query.page) qs.set('page', req.query.page)
  if (req.query.unread) qs.set('unread', req.query.unread)
  ids.forEach((id) => qs.append('user_id[]', id))
  const r = await fetch(
    `${SERVICES.notifications}/api/v1/tenants/${req.jwt.tenant_id}/notifications?${qs}`,
    { headers: { Authorization: req.headers.authorization } })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) return res.status(r.status).json(json)
  res.json(json)
})

app.post('/api/v1/me/notifications/:id/read', auth, (req, res) =>
  upstream(req, res, SERVICES.notifications,
    `/api/v1/tenants/${req.jwt.tenant_id}/notifications/${req.params.id}/read`,
    { method: 'POST', body: {} }))

// --- Chatbot (AI Agent, customer profile) -------------------------------

// The only chat edge for the portal — the profile is pinned server-side
// so a customer can never reach the dispatcher/support tool registries.
// Gated by the `ai-agent` flag — feature-level off, not portal maintenance.
app.post('/api/v1/chat', auth, async (req, res) => {
  if (!(await flagEnabled('ai-agent')))
    return res.status(503).json({ error: 'feature_disabled', message: 'The assistant is temporarily unavailable.' })
  return upstream(req, res, SERVICES.ai, '/api/v1/chat', {
    method: 'POST',
    body: {
      profile: 'customer',
      message: req.body?.message,
      context: req.body?.context,
    },
  })
})

app.use((err, req, res, _next) => {
  console.error('[bff]', req.method, req.path, err.cause?.code ?? err.message)
  res.status(502).json({ message: 'A backing service is unavailable — try again shortly' })
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`[bff] customer-portal-bff :${port}`))
