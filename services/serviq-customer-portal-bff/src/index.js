import express from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { startProjector } from './projector.js'

const app = express()
app.use(express.json())

const jwks = createRemoteJWKSet(
  new URL(process.env.JWT_JWKS_URL || 'http://identity-access-backend/.well-known/jwks.json'))

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

const { mongo } = await startProjector()
const db = mongo.db()

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'customer-portal-bff' }))

// Customer-facing reads — tenant-scoped, read-model only (no cross-service fan-out).
app.get('/api/v1/me/requests', auth, async (req, res) => {
  res.json({ data: await db.collection('portal_requests')
    .find({ tenant_id: req.jwt.tenant_id }).sort({ _id: -1 }).limit(50).toArray() })
})

app.get('/api/v1/me/jobs', auth, async (req, res) => {
  res.json({ data: await db.collection('portal_jobs')
    .find({ tenant_id: req.jwt.tenant_id }).sort({ _id: -1 }).limit(50).toArray() })
})

app.get('/api/v1/me/jobs/:id', auth, async (req, res) => {
  const doc = await db.collection('portal_jobs').findOne({ _id: req.params.id, tenant_id: req.jwt.tenant_id })
  if (!doc) return res.status(404).json({ message: 'Not found' })
  res.json({ data: doc })
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`[bff] customer-portal-bff :${port}`))
