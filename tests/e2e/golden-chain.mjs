// Golden-chain E2E spike — the hardest test in the suite, built first to
// prove the pattern: customer books → dispatcher converts + assigns →
// agent sees and checks in. Three portals, three browser contexts, three
// async event hops.
//
// Runs inside the playwright container:
//   docker run --rm --add-host host.docker.internal:host-gateway \
//     -v "$PWD/tests/e2e:/tests" -w /tests \
//     mcr.microsoft.com/playwright:v1.55.0-noble node golden-chain.mjs
//
// Two environment facts drive the design:
//  - Frontends bake VITE_* = localhost:PORT — --host-resolver-rules maps
//    the *browser's* localhost to the Docker host gateway; page loads and
//    API calls both land on host-mapped ports. No config changes.
//  - Tokens live in React state, not localStorage — full-page goto loses
//    auth. All navigation is in-app clicks after login.

import { chromium } from 'playwright'
import dns from 'node:dns/promises'

const GATEWAY = await dns.lookup('host.docker.internal').then(r => r.address).catch(() => '192.168.65.254')
const BASE = {
  customer: 'http://localhost:3000',
  agent: 'http://localhost:3001',
  console: 'http://localhost:3002',
}
const PASS = 'demo-pass-123'
const TENANT = 'acme'
const MARK = `E2E-${Date.now()}`
const ok = (s) => console.log(`✓ ${s}`)

const browser = await chromium.launch({
  args: [`--host-resolver-rules=MAP localhost ${GATEWAY}`],
})

// MUI Select helper — options render in a portal listbox.
async function select(page, label, optionText) {
  await page.getByLabel(label).click()
  await page.getByRole('option', { name: optionText }).click()
}

async function login(page, base, user) {
  // Tenant users log in under their tenant slug — bare /login resolves
  // platform scope and rejects tenant accounts.
  await page.goto(`${base}/provider/${TENANT}/login`)
  // MUI labels are aria-associated; the Tailwind console's <label> isn't
  // — fall back to raw inputs when getByLabel can't resolve.
  const userInput = (await page.getByLabel('Username').count()) > 0
    ? page.getByLabel('Username') : page.locator('input').first()
  const passInput = (await page.getByLabel('Password').count()) > 0
    ? page.getByLabel('Password') : page.locator('input[type="password"]')
  await userInput.fill(user)
  await passInput.fill(PASS)
  // IAM throttles logins to 5/min per client IP — repeated E2E runs
  // share the playwright container's IP, so back off and retry rather
  // than failing on "Too Many Attempts".
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole('button', { name: /sign in/i }).click()
    try {
      await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
      return
    } catch {
      const alerts = await page.locator('[role="alert"], .MuiAlert-root, .text-red-700').allTextContents().catch(() => [])
      if (alerts.some((a) => /too many/i.test(a))) {
        console.log(`  login throttled for ${user} — waiting out the limiter`)
        await page.waitForTimeout(65000)
        continue
      }
      if (alerts.length) throw new Error(`login rejected for ${user}: ${alerts.join(' | ')}`)
      if (attempt >= 2) {
        await page.screenshot({ path: `login-stall-${user}.png` })
        throw new Error(`login stalled for ${user} — no navigation, no error (see login-stall-${user}.png)`)
      }
    }
  }
  throw new Error(`login still throttled for ${user} after retries`)
}

try {
  // ── Leg 1: customer books a service ──────────────────────────────────
  const customer = await browser.newContext()
  const cp = await customer.newPage()
  await login(cp, BASE.customer, 'jane.customer')
  ok('customer logged in')

  // First-login profile gate (async — renders after the profile check):
  // "Welcome! One last step" asks for a name when the CRM customer lacks
  // a portal profile. Race it against the home CTA.
  const gate = cp.getByText(/one last step/i)
  const cta = cp.getByRole('link', { name: /browse services|book a service/i }).first()
  await Promise.race([gate.waitFor({ timeout: 15000 }), cta.waitFor({ timeout: 15000 })]).catch(() => {})
  if (await gate.isVisible().catch(() => false)) {
    await cp.getByLabel(/full name/i).fill('Jane Customer')
    await cp.getByRole('button', { name: /continue/i }).click()
    ok('profile gate completed')
    await cta.waitFor({ timeout: 15000 })
  }

  // Landing CTA varies: "Browse services" (empty state) vs
  // "Book a service" (has history) — either reaches the catalog.
  await cta.click()
  await cp.getByRole('link', { name: 'Book', exact: true }).first().click()
  await cp.waitForURL(/\/book\//, { timeout: 10000 })

  // Service is preselected via /book/:serviceId. Address: new entry.
  await select(cp, 'Address', /new address/i)
  await cp.getByLabel(/street/i).fill('123 E2E Avenue')
  await cp.getByLabel('City').fill('E2E City')
  await cp.getByLabel('Preferred date').fill('2026-10-20')
  await cp.getByLabel('Notes for the technician').fill(MARK)
  await cp.getByRole('button', { name: /submit request/i }).click()
  await cp.waitForURL(/\/requests\//, { timeout: 20000 })
  const requestId = cp.url().split('/').pop()
  ok(`customer booked — ${MARK} (request ${requestId.slice(0, 8)})`)

  // ── Leg 2: dispatcher converts + assigns ──────────────────────────────
  const dispatcher = await browser.newContext()
  const dp = await dispatcher.newPage()
  await login(dp, BASE.console, 'acme.admin')
  ok('dispatcher logged in')

  await dp.getByRole('link', { name: 'Service requests' }).click()
  // Event hop 1: request projects into the console queue.
  const row = dp.locator('button', { hasText: MARK }).first()
  await row.waitFor({ timeout: 40000 })
  await row.click()
  ok('request projected into dispatch queue')

  await dp.getByRole('button', { name: /convert to job/i }).click()
  await dp.getByText(/hand-off/i).first().waitFor({ timeout: 15000 })
  ok('request converted to job')

  // PRODUCT GAP (found by this test): converted jobs sit at `requested`
  // — no UI element transitions requested → confirmed →
  // ready_for_assignment, which dispatch/assign requires. Seed the two
  // transitions via API until the console exposes them.
  let iamLogin
  for (let attempt = 0; attempt < 4; attempt++) {
    iamLogin = await fetch(`http://${GATEWAY}:8010/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'acme.admin', password: PASS, tenant: TENANT }),
    }).then((r) => r.json())
    if (iamLogin.access_token) break
    if (!/too many/i.test(JSON.stringify(iamLogin))) break
    console.log('  seed login throttled — waiting out the limiter')
    await new Promise((r) => setTimeout(r, 65000))
  }
  if (!iamLogin.access_token) throw new Error(`IAM login failed: ${JSON.stringify(iamLogin)}`)
  const tId = '01ac0000-0000-7000-8000-00000000acde'
  const jobs = await fetch(`http://${GATEWAY}:8014/api/v1/tenants/${tId}/jobs`, {
    headers: { authorization: `Bearer ${iamLogin.access_token}` },
  }).then((r) => r.json())
  // Match THIS booking's job — not any stale 'requested' row left by
  // earlier runs; find by the request link.
  const job = (jobs.data ?? []).find((j) => j.request_id === requestId)
  if (!job) throw new Error(`no job for request ${requestId} — jobs list: ${JSON.stringify(jobs).slice(0, 400)}`)
  for (const action of ['confirm', 'ready']) {
    await fetch(`http://${GATEWAY}:8014/api/v1/tenants/${tId}/jobs/${job.id}/${action}`, {
      method: 'POST', headers: { authorization: `Bearer ${iamLogin.access_token}` },
    })
  }
  ok(`job ${job.id.slice(0, 8)} transitioned to ready (seeded via API)`)

  // Event hop 2: ReadyForAssignment projects and the tenant's default
  // 'automatic' strategy assigns Anna without any UI step — assigned jobs
  // leave the queue, so assert the assignment on the Jobs monitor.
  await dp.getByRole('link', { name: 'Jobs' }).click()
  await dp.locator('button', { hasText: job.id.slice(0, 8) }).first()
    .waitFor({ timeout: 40000 })
  ok('job projected, auto-assigned to Anna')

  // ── Leg 3: agent sees the job and checks in ───────────────────────────
  const agent = await browser.newContext()
  const ap = await agent.newPage()
  await login(ap, BASE.agent, 'anna.agent')
  ok('agent logged in')

  // Event hop 3: execution projected into the agent's home job list.
  const card = ap.locator('a[href*="/jobs/"]').first()
  await card.waitFor({ timeout: 40000 })
  await card.click()
  ok('job visible to agent')

  await ap.getByRole('button', { name: /check in/i }).waitFor({ timeout: 15000 })
  await ap.getByRole('button', { name: /check in/i }).click()
  ok('agent checked in — full chain green')

  console.log('\nGOLDEN CHAIN: PASS')
} catch (e) {
  console.error('\nGOLDEN CHAIN: FAIL')
  console.error(e.message)
  process.exit(1)
} finally {
  await browser.close()
}
