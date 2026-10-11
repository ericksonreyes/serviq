// Support backend feature tests — real Express app over a throwaway
// Postgres database on the compose network (serviq_support_test).
// Covers: auth, case intake + notes + transitions, refund decision →
// Support.RefundDecided outbox (ADR-0004: Support decides, Billing executes).
// Run: docker compose exec into a node container on the serviq network —
// see scripts/test.sh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { SignJWT } from 'jose';
import { Client } from 'pg';

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TENANT = crypto.randomUUID();
const SECRET = process.env.JWT_SECRET;
const env = {
  ...process.env, PORT: String(PORT),
  DB_DATABASE: process.env.DB_DATABASE || 'serviq_support_test',
};

let server; let pg;

async function token(claims = {}) {
  return await new SignJWT({
    sub: crypto.randomUUID(), tenant_id: TENANT,
    roles: ['Support Agent'], ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('serviq-iam').setAudience('serviq')
    .setIssuedAt().setExpirationTime('1h')
    .setJti(crypto.randomUUID())
    .sign(new TextEncoder().encode(SECRET));
}

async function api(method, path, body, t) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: {
      'content-type': 'application/json',
      ...(t ? { authorization: `Bearer ${t}` } : { authorization: `Bearer ${await token()}` }),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function outboxHas(type, contains) {
  const { rows } = await pg.query('SELECT type, payload FROM outbox WHERE type = $1', [type]);
  return rows.some((r) => Object.entries(contains).every(([k, v]) => r.payload[k] === v));
}

test.before(async () => {
  server = spawn('node', ['dist/main.js'], { env, stdio: 'inherit' });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  pg = new Client({
    host: env.DB_HOST || 'postgres', port: 5432,
    database: env.DB_DATABASE, user: 'serviq', password: 'serviq',
  });
  await pg.connect();
  await pg.query('DELETE FROM outbox'); // clean slate for event asserts
});

test.after(() => { server?.kill(); pg?.end(); });

test('health is public', async () => {
  const res = await fetch(`${BASE}/health`);
  assert.equal(res.status, 200);
});

test('protected routes reject missing token', async () => {
  const res = await fetch(`${BASE}/v1/tenants/${TENANT}/cases`);
  assert.equal(res.status, 401);
});

test('case intake emits Support.CaseOpened', async () => {
  const r = await api('POST', '/v1/cases', { subject: 'Broken job', details: 'agent never showed' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.status, 'open');
  assert.equal(r.body.data.tenant_id, TENANT);
  assert.ok(await outboxHas('Support.CaseOpened', { case_id: r.body.data.id }));
});

test('case notes + status transition rules', async () => {
  const c = await api('POST', '/v1/cases', { subject: 'x' });
  const id = c.body.data.id;

  const note = await api('POST', `/v1/tenants/${TENANT}/cases/${id}/notes`, { body: 'investigating' });
  assert.equal(note.status, 201);
  assert.ok(await outboxHas('Support.CaseNoted', { case_id: id }));

  // open → resolved directly is allowed per CASE_NEXT
  const ok = await api('POST', `/v1/tenants/${TENANT}/cases/${id}/status`, { status: 'resolved' });
  assert.equal(ok.status, 200);
  assert.ok(await outboxHas('Support.CaseStatusChanged', { case_id: id }));

  // resolved is terminal — notes and transitions dead-end
  assert.equal((await api('POST', `/v1/tenants/${TENANT}/cases/${id}/notes`, { body: 'x' })).status, 409);
  assert.equal((await api('POST', `/v1/tenants/${TENANT}/cases/${id}/status`, { status: 'open' })).status, 409);
});

test('refund decision: approved emits, denied does not', async () => {
  // approved requires the case to carry an invoice_id
  const noInvoice = await api('POST', '/v1/cases', { subject: 'refund pls' });
  assert.equal((await api('POST', `/v1/tenants/${TENANT}/cases/${noInvoice.body.data.id}/refund-decision`, {
    decision: 'approved',
  })).status, 422);

  const invoiceId = crypto.randomUUID();
  const c = await api('POST', '/v1/cases', { subject: 'refund pls', invoice_id: invoiceId });
  const id = c.body.data.id;

  const ok = await api('POST', `/v1/tenants/${TENANT}/cases/${id}/refund-decision`, {
    decision: 'approved', amount_cents: 150000, reason: 'not satisfied',
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.case_id === id, true);
  assert.ok(await outboxHas('Support.RefundDecided', { invoice_id: invoiceId }));
  assert.equal(c.body.data.id && (await api('GET', `/v1/tenants/${TENANT}/cases/${id}`)).body.data.status, 'decided');

  // denied decision → no RefundDecided event
  const c2 = await api('POST', '/v1/cases', { subject: 'refund 2', invoice_id: crypto.randomUUID() });
  const denied = await api('POST', `/v1/tenants/${TENANT}/cases/${c2.body.data.id}/refund-decision`, { decision: 'denied' });
  assert.equal(denied.status, 201);
  const { rows } = await pg.query(
    "SELECT COUNT(*) FROM outbox WHERE type='Support.RefundDecided' AND payload->>'case_id' = $1",
    [c2.body.data.id]);
  assert.equal(Number(rows[0].count), 0);
});

test('tenant isolation: foreign URL 403s, missing case 404s', async () => {
  const c = await api('POST', '/v1/cases', { subject: 'mine' });
  // tenantScope middleware — URL tenant ≠ token tenant → 403 before routes
  assert.equal((await api('GET', `/v1/tenants/${crypto.randomUUID()}/cases/${c.body.data.id}`)).status, 403);
  // own tenant path, case that doesn't exist → 404
  assert.equal((await api('GET', `/v1/tenants/${TENANT}/cases/${crypto.randomUUID()}`)).status, 404);
});
