import express from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// Aggregation edge for field agents — fans out to owning services with
// the caller's JWT forwarded verbatim. No read model here by design.

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

async function get(url, req) {
  const r = await fetch(url, { headers: AUTH(req) })
  if (!r.ok) return null
  return r.json()
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'service-agent-bff' }))

// Agent home: my profile + open offers + active executions, one round trip.
app.get('/api/v1/agents/:agentId/home', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const { agentId } = req.params
  const [offers, executions, agent] = await Promise.all([
    get(`${SERVICES.dispatch}/api/v1/tenants/${t}/offers?agent_id=${agentId}`, req),
    get(`${SERVICES.field}/api/v1/tenants/${t}/executions?agent_id=${agentId}`, req),
    get(`${SERVICES.workforce}/api/v1/tenants/${t}/agents/${agentId}`, req),
  ])
  res.json({ data: { agent, offers, executions } })
})

// Step execution proxy — same call shape the agent UI needs.
app.post('/api/v1/executions/:id/steps/:position/:action', auth, async (req, res) => {
  const t = req.jwt.tenant_id
  const r = await fetch(
    `${SERVICES.field}/api/v1/tenants/${t}/executions/${req.params.id}/steps/${req.params.position}/${req.params.action}`,
    { method: 'POST', headers: AUTH(req) })
  res.status(r.status).json(await r.json())
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`[bff] service-agent-bff :${port}`))
