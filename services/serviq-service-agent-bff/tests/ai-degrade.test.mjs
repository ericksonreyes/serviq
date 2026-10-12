// Contract: payment evidence still lands in Billing when the AI Agent is down
// or failing — the BFF degrades to the uploader's claimed values
// (TEST_SCENARIOS "AI down at submit time"). Runs the real src/index.js
// against stub JWKS / Billing / AI servers; no stack required.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'

const TENANT = '01ac0000-0000-7000-8000-00000000acde'
let stub, bff, token, aiMode = 'down'
const received = []

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)))
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)) })

before(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' }
  token = await new SignJWT({ tenant_id: TENANT, roles: ['Service Agent'] })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer('serviq-iam').setAudience('serviq').setSubject('agent-user').setIssuedAt().setExpirationTime('5m')
    .sign(privateKey)

  stub = createServer(async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
    if (req.url === '/jwks') return json(200, { keys: [jwk] })
    if (req.url === '/api/v1/parse') {
      await body(req)
      if (aiMode === 'down') return req.socket.destroy()
      if (aiMode === 'error') return json(500, { detail: 'model crashed' })
      return json(200, { document_type: 'e_wallet_receipt', confidence: 0.93, fields: { reference_no: 'AI-REF-9', amount: 1250 } })
    }
    if (req.url === `/api/v1/tenants/${TENANT}/payment-evidence` && req.method === 'POST') {
      const payload = JSON.parse(await body(req))
      received.push({ auth: req.headers.authorization, payload })
      return json(201, { data: { id: `ev-${received.length}`, status: 'accepted' } })
    }
    json(404, {})
  })
  const port = await listen(stub)
  const stubUrl = `http://127.0.0.1:${port}`
  const bffPort = port + 1
  bff = spawn('node', ['src/index.js'], {
    env: { ...process.env, PORT: String(bffPort), JWT_JWKS_URL: `${stubUrl}/jwks`, BILLING_URL: stubUrl, AI_URL: stubUrl },
    stdio: 'ignore',
  })
  globalThis.BFF = `http://127.0.0.1:${bffPort}`
  globalThis.STUB = stubUrl
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BFF}/api/health`); return } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  throw new Error('bff did not start')
})

after(() => { bff?.kill(); stub?.close() })

async function submit() {
  return fetch(`${BFF}/api/v1/payment-evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_type: 'E_WALLET', file_ref: 'minio://evidence/r.jpg', invoice_id: null,
      file_b64: Buffer.from('fake image').toString('base64'), filename: 'r.jpg',
      claimed: { reference: 'CLAIM-1', amount_cents: 125000 },
    }),
  })
}

test('AI unreachable → evidence lands with claimed values, no parse metadata', async () => {
  const r = await submit()
  assert.equal(r.status, 201)
  const { auth, payload } = received.at(-1)
  assert.equal(auth, `Bearer ${token}`)
  assert.equal(payload.document_type, 'E_WALLET')
  assert.deepEqual(payload.extracted.reference, 'CLAIM-1')
  assert.equal(payload.extracted.amount_cents, 125000)
  assert.equal(payload.confidence, null)
  assert.deepEqual(payload.claimed, { reference: 'CLAIM-1', amount_cents: 125000 })
})

test('AI returns 5xx → same claimed-only degrade', async () => {
  aiMode = 'error'
  const r = await submit()
  assert.equal(r.status, 201)
  assert.equal(received.at(-1).payload.extracted.reference, 'CLAIM-1')
})

test('AI healthy → parsed fields win over claimed, confidence recorded', async () => {
  aiMode = 'ok'
  const r = await submit()
  assert.equal(r.status, 201)
  const { payload } = received.at(-1)
  assert.equal(payload.extracted.reference, 'AI-REF-9')
  assert.equal(payload.extracted.amount_cents, 125000)
  assert.equal(payload.confidence, 0.93)
})
