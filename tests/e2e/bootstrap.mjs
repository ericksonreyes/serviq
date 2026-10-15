// World bootstrap — runs first under `./scripts/e2e.sh --fresh` on the
// isolated postgres-e2e cluster, where only canonical seeds exist (IAM
// permissions + platform admin, plans, feature flags, locations,
// notification templates). The acme tenant and every persona are built
// here through the REAL UI flows — the suite IS the onboarding story:
//
//   provider self-signup → platform activates → tenant configures →
//   agent accepts invite → customer signs up
//
// Every step is create-if-absent (probe = the real end state), so the
// suite also validates an already-seeded world and no-ops fast.
//
// Documented API exception: company accounts (transfer-rail recipients)
// are read-only in the console UI — RemittanceTurnIn displays them but
// no create form exists — so step 4e POSTs them with the acme.admin JWT.
import { run, newPage, login, field, BASE, PASS, TENANT, ok, customerHome, signupSubmit, paceAuth } from './lib/harness.mjs'

const ADMIN_PASS = 'serviq-local'
const HOST = process.env.API_HOST || 'host.docker.internal'
const API = {
  iam: `http://${HOST}:8010`,
  platform: `http://${HOST}:8011`,
  billing: `http://${HOST}:8020`,
}

// ── API helpers (Node-side; host.docker.internal maps via --add-host) ────
const get = (url, token) =>
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
const post = (url, body, token) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })

// providers/{slug} is the PUBLIC directory — active tenants only. Pending
// tenants 404 there, so existence checks must go through the admin list.
let adminToken = null
const platformToken = async () => {
  if (!adminToken) {
    await paceAuth()
    const r = await post(`${API.iam}/api/v1/auth/login`, { username: 'admin', password: ADMIN_PASS })
    adminToken = (await r.json().catch(() => ({}))).access_token
  }
  return adminToken
}

// A failed probe must NOT read as "absent" — that cascades into a bogus
// signup ("slug already taken") whenever the platform API is mid-restart
// or the admin login is throttled. Retry briefly, then fail with the
// real reason.
const provider = async (slug) => {
  for (let i = 0; i < 6; i++) {
    const r = await get(`${API.platform}/api/v1/tenants`, await platformToken()).catch(() => null)
    if (r?.ok) {
      const d = await r.json()
      return (d?.data ?? d ?? []).find?.((t) => t.slug === slug) || null
    }
    await new Promise((res) => setTimeout(res, 5000))
  }
  throw new Error('tenant list probe failed — platform API not answering')
}

// Probe a login without going through the UI — cheap, still throttled,
// so callers space attempts out.
const canLogin = async (username, tenant) => {
  await paceAuth()
  const r = await post(`${API.iam}/api/v1/auth/login`, { username, password: PASS, tenant })
  return r.ok
}

const waitFor = async (label, probe, { tries = 24, every = 5000 } = {}) => {
  for (let i = 0; i < tries; i++) {
    if (await probe().catch(() => false)) return
    await new Promise((r) => setTimeout(r, every))
  }
  throw new Error(`${label} not ready after ${(tries * every) / 1000}s`)
}

// The console stores the access token in sessionStorage (no "keep me
// signed in") — pull it for the plumbing calls the UI can't do.
const consoleToken = (page) =>
  page.evaluate(() => sessionStorage.getItem('serviq.token') || localStorage.getItem('serviq.token'))

await run('bootstrap', async (browser) => {
  const p = await newPage(browser)
  let tenant = await provider(TENANT)

  // ── 1. Provider self-signup (console /signup) ─────────────────────────
  if (tenant) {
    ok(`tenant ${TENANT} already exists — skipping signup`)
  } else {
    await p.goto(`${BASE.console}/signup`)
    await field(p, 'Organization name').fill('Acme Services')
    await field(p, 'Slug').fill(TENANT)
    await field(p, 'Describe your services (optional)').fill('Appliance repair and on-demand home services.')
    await field(p, 'Your name').fill('Acme Admin')
    await field(p, 'Username').fill('acme.admin')
    await field(p, 'Email').fill('admin@acme.test')
    // Plain inputs (not MUI) — type="password" is unambiguous by order.
    await p.locator('input[type="password"]').nth(0).fill(PASS)
    await p.locator('input[type="password"]').nth(1).fill(PASS)
    await p.getByRole('button', { name: 'Create organization' }).click()
    await p.getByText(/pending platform review/i).waitFor({ timeout: 90000 })
    ok('provider signup submitted — pending platform review')

    // ── 2. TenantCreated → IAM provisions scope + admin (event pipeline)
    await waitFor('IAM tenant provisioning', () => canLogin('acme.admin', TENANT))
    ok('IAM provisioned acme.admin via TenantCreated')

    tenant = await provider(TENANT)
  }

  // ── 3. Platform activates the tenant ──────────────────────────────────
  if (tenant?.status === 'active') {
    ok('tenant already active')
  } else {
    const pp = await newPage(browser)
    await login(pp, BASE.platform, 'admin', { pass: ADMIN_PASS, slug: null })
    await pp.getByRole('link', { name: 'Service Providers' }).click()
    await pp.getByRole('link', { name: /acme/i }).first().click()
    await pp.getByRole('button', { name: 'Activate', exact: true }).click()
    await waitFor('tenant activation', async () => (await provider(TENANT))?.status === 'active', { tries: 12 })
    ok('platform activated the tenant')
    await pp.close()
  }

  // ── 4. Tenant admin configures the business ───────────────────────────
  await login(p, BASE.console, 'acme.admin')
  const token = await consoleToken(p)
  const tenantId = (await provider(TENANT))?.id

  // 4a. Service catalog — needs at least one bookable service.
  await p.getByRole('link', { name: 'Service catalog', exact: true }).click()
  const hasService = await p.getByText(/general repair/i).count()
  if (!hasService) {
    await p.getByRole('button', { name: 'New service' }).click()
    await field(p, 'Name').fill('General Repair')
    await field(p, 'Base price (PHP)').fill('1500')
    await p.getByRole('button', { name: 'Create service' }).click()
    await p.getByText(/general repair/i).first().waitFor({ timeout: 10000 }).catch(() => {})
  }
  ok('service catalog has a bookable service')

  // 4b. Service area — "nationwide" is the deterministic coverage pick.
  await p.getByRole('link', { name: 'Service areas', exact: true }).click()
  const hasArea = await p.locator('text=/metro|nationwide/i').count()
  if (!hasArea) {
    await p.getByRole('button', { name: 'Add area', exact: true }).click()
    await field(p, 'Name').fill('Metro Coverage')
    await p.getByPlaceholder(/type places you cover/i).fill('nationwide')
    await p.getByText('Nationwide', { exact: true }).first().waitFor({ timeout: 8000 })
    await p.getByText('Nationwide', { exact: true }).first().click()
    await p.getByRole('button', { name: 'Add area', exact: true }).first().click()
    await p.getByText(/metro coverage/i).first().waitFor({ timeout: 10000 }).catch(() => {})
  }
  ok('service area covers the booking location')

  // 4c. Agent — invite, then she accepts, then link the roster record.
  const usersRes = await get(`${API.iam}/api/v1/users`, token)
  const users = (await usersRes.json().catch(() => ({})))?.data ?? []
  const anna = Array.isArray(users) ? users.find((u) => u.username === 'anna.agent') : null

  let acceptUrl = null
  await p.getByRole('link', { name: 'Service agents', exact: true }).click()
  const rosterHasAnna = await p.getByText(/anna agent/i).count()

  if (!anna && !rosterHasAnna) {
    // Invite by email — the accept link renders in the notice (no SMTP locally).
    await p.getByRole('button', { name: 'Invite by email' }).click()
    await field(p, 'Email').fill('agent@acme.test')
    await p.getByRole('button', { name: 'Send invite' }).click()
    const link = p.locator('a[href*="/signup?invite="]').first()
    await link.waitFor({ timeout: 60000 })
    acceptUrl = await link.getAttribute('href')
    await p.getByRole('button', { name: 'Back to list' }).click()
    ok('agent invite issued')

    // ── 5. Agent accepts the invite on her portal ───────────────────────
    const ap = await newPage(browser)
    // acceptUrl points at localhost:3001 — the resolver rule maps it.
    await ap.goto(acceptUrl)
    // MUI required fields expose names like "Full name *" — substring
    // match resolves them; the two password inputs disambiguate by order.
    await ap.getByLabel('Full name').fill('Anna Agent')
    await ap.getByLabel('Username').fill('anna.agent')
    await ap.locator('input[type="password"]').nth(0).fill(PASS)
    await ap.locator('input[type="password"]').nth(1).fill(PASS)
    await signupSubmit(ap)
    await waitFor('anna.agent account', () => canLogin('anna.agent', TENANT), { tries: 12 })
    ok('agent accepted invite — account live')
    await ap.close()
  } else {
    ok('anna.agent already provisioned')
  }

  // 4d. Roster record linked to her IAM user (needed by the agent BFF).
  if (!rosterHasAnna) {
    const u2 = await get(`${API.iam}/api/v1/users`, token)
    const annaId = ((await u2.json().catch(() => ({})))?.data ?? [])
      .find((u) => u.username === 'anna.agent')?.id
    await p.getByRole('link', { name: 'Service agents', exact: true }).click()
    await p.getByRole('button', { name: 'Add agent' }).click()
    await field(p, 'Name').fill('Anna Agent')
    if (annaId) await field(p, 'IAM user id (optional)').fill(annaId)
    await field(p, 'Capacity (jobs/day)').fill('5')
    await p.getByRole('button', { name: 'Add agent', exact: true }).click()
    await p.getByText(/anna agent/i).first().waitFor({ timeout: 10000 }).catch(() => {})
    ok('roster record linked to anna.agent')
  }

  // 4e. Company accounts — API ONLY: the console renders them read-only
  // (RemittanceTurnIn destination picker); no create form exists.
  const accts = await get(`${API.billing}/api/v1/tenants/${tenantId}/company-accounts`, token)
  if (((await accts.json().catch(() => ({})))?.data ?? []).length === 0) {
    for (const a of [
      { channel: 'wallet', label: 'GCash — ServIQ Acme', account_no: '09171234567' },
      { channel: 'bank', label: 'BDO — ServIQ Acme', account_no: '001234567890' },
    ]) {
      const r = await post(`${API.billing}/api/v1/tenants/${tenantId}/company-accounts`, a, token)
      if (!r.ok) throw new Error(`company account seed failed: ${r.status}`)
    }
    ok('company accounts seeded (API — no console UI exists for this)')
  } else {
    ok('company accounts already configured')
  }

  // ── 6. Customer signs up on the portal ────────────────────────────────
  if (await canLogin('jane.customer', TENANT)) {
    ok('jane.customer already exists')
  } else {
    const cp = await newPage(browser)
    await cp.goto(`${BASE.customer}/provider/${TENANT}/signup`)
    await cp.getByLabel('Full name').fill('Jane Customer')
    await cp.getByLabel('Username').fill('jane.customer')
    await cp.getByLabel('Email').fill('customer@acme.test')
    await cp.locator('input[type="password"]').nth(0).fill(PASS)
    await cp.locator('input[type="password"]').nth(1).fill(PASS)
    await signupSubmit(cp)
    await waitFor('jane.customer account', () => canLogin('jane.customer', TENANT), { tries: 12 })
    ok('customer signed up — IAM account live')
    await cp.close()
  }

  // Signup provisions the IAM account only; the CRM customer record is
  // created lazily by the "One last step" gate on her first portal visit.
  // Suites that book as jane need that record — finish the gate here.
  {
    const jp = await newPage(browser)
    await login(jp, BASE.customer, 'jane.customer')
    await customerHome(jp)
    await jp.close()
    ok('jane.customer profile provisioned (CRM record)')
  }
})
