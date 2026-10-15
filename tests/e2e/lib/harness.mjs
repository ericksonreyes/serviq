// Shared E2E harness — browser launch, login with throttle back-off, and
// the multi-portal steps every persona flow reuses. Lives in lib/ so the
// runner's top-level `*.mjs` glob doesn't execute it as a test.
//
// Environment facts (see workspace/specs/testing/README.MD):
//  - Frontends bake VITE_* = localhost:PORT — --host-resolver-rules maps
//    the browser's localhost to the Docker host gateway.
//  - Access tokens persist in sessionStorage (refresh in session or local
//    storage), so page.goto/reload keep auth — polling a dedicated detail
//    page is as valid as in-app nav when the target needs a hard refresh.
import { chromium } from 'playwright'
import dns from 'node:dns/promises'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const GATEWAY = await dns.lookup('host.docker.internal').then((r) => r.address).catch(() => '192.168.65.254')

export const BASE = {
  customer: 'http://localhost:3000',
  agent: 'http://localhost:3001',
  console: 'http://localhost:3002',
  platform: 'http://localhost:3003',
}
export const PASS = 'demo-pass-123'
export const TENANT = 'acme'
export const ok = (s) => console.log(`✓ ${s}`)
export const mark = (prefix = 'E2E') => `${prefix}-${Date.now()}`

// Runs one named E2E: launches Chromium, screenshots every open page on
// failure (fail-<name>-N.png), exits non-zero so the runner stops.
export async function run(name, fn) {
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP localhost ${GATEWAY}`] })
  try {
    await fn(browser)
    console.log(`\n${name}: PASS`)
  } catch (e) {
    console.error(`\n${name}: FAIL`)
    console.error(e.message)
    let n = 0
    for (const ctx of browser.contexts()) for (const pg of ctx.pages()) {
      await pg.screenshot({ path: `fail-${name.toLowerCase().replace(/\W+/g, '-')}-${n++}.png`, fullPage: true }).catch(() => {})
    }
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

export async function newPage(browser) {
  return (await browser.newContext()).newPage()
}

// MUI Select — options render in a portal listbox.
export async function select(page, labelText, optionText) {
  await page.getByLabel(labelText).click()
  await page.getByRole('option', { name: optionText }).click()
}

// Console/platform <label>s aren't aria-associated — locate the input
// that follows a label with this exact text.
export const field = (page, labelText) =>
  page.locator(`xpath=//label[normalize-space()="${labelText}"]/following::*[self::input or self::select or self::textarea][1]`).first()

async function fillLogin(page, user, pass) {
  // input[type=password] is unambiguous — "Show password" adornment
  // buttons collide under getByLabel('Password') substring matching, and
  // exact:true fails because required fields' names gain a " *" suffix.
  // Console/platform <label>s aren't aria-associated; input.first() would
  // be the Provider field there, so fall back to the label-following xpath.
  const userInput = (await page.getByLabel('Username').count()) > 0 ? page.getByLabel('Username') : field(page, 'Username')
  const passInput = (await page.locator('input[type="password"]').count()) > 0 ? page.locator('input[type="password"]') : page.getByLabel('Password')
  await userInput.fill(user)
  await passInput.fill(pass)
}

const alertsOf = (page) =>
  page.locator('[role="alert"], .MuiAlert-root, .text-red-700').allTextContents().catch(() => [])

// ── Throttle-aware auth ──────────────────────────────────────────────────
// IAM throttles every anonymous auth endpoint (login, register,
// invitations/accept) to 5/min per source IP — and every playwright
// container reaches it through the host gateway, so the whole run shares
// one bucket. Two defences, both shared across suite processes via
// .runtime/ on the /tests bind mount:
//   - paceAuth(): 13s between any two anonymous-auth submits, so bursts
//     can never trip a 5/min bucket (~4.6/min sustained, worst case).
//   - persona JWTs are cached and injected on repeat logins — suites only
//     drive the login form once per persona per world.
const RUNTIME = '.runtime'
const AUTH_PACE_FILE = `${RUNTIME}/auth-pace.json`
const TOKEN_CACHE_FILE = `${RUNTIME}/tokens.json`
const AUTH_GAP_MS = 13_000

export async function paceAuth() {
  let last = 0
  try { last = JSON.parse(readFileSync(AUTH_PACE_FILE, 'utf8')).last || 0 } catch {}
  const wait = last + AUTH_GAP_MS - Date.now()
  if (wait > 0) {
    console.log(`  pacing auth submit — ${Math.ceil(wait / 1000)}s`)
    await new Promise((r) => setTimeout(r, wait))
  }
  mkdirSync(RUNTIME, { recursive: true })
  writeFileSync(AUTH_PACE_FILE, JSON.stringify({ last: Date.now() }))
}

function cachedToken(user) {
  try {
    const t = JSON.parse(readFileSync(TOKEN_CACHE_FILE, 'utf8'))[user]
    if (t?.exp && t.exp * 1000 > Date.now() + 60_000) return t
  } catch {}
  return null
}

async function stashToken(page, user) {
  const [token, refresh] = await page.evaluate(() => [
    sessionStorage.getItem('serviq.token') ?? localStorage.getItem('serviq.token'),
    sessionStorage.getItem('serviq.refresh') ?? localStorage.getItem('serviq.refresh'),
  ])
  let exp = 0
  try { exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp ?? 0 } catch {}
  if (!exp) return
  let cache = {}
  try { cache = JSON.parse(readFileSync(TOKEN_CACHE_FILE, 'utf8')) } catch {}
  cache[user] = { token, refresh, exp }
  mkdirSync(RUNTIME, { recursive: true })
  writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cache))
}

// Tenant users log in under /provider/<slug>/login; platform staff use
// bare /login. First login per persona goes through the real form and its
// JWT is cached; repeat calls inject the token into sessionStorage (the
// same store the SPA's auth provider reads) instead of re-submitting.
export async function login(page, base, user, { pass = PASS, slug = TENANT } = {}) {
  const hit = cachedToken(user)
  if (hit) {
    await page.goto(base)
    await page.evaluate(([t, r, s]) => {
      sessionStorage.setItem('serviq.token', t)
      if (r) sessionStorage.setItem('serviq.refresh', r)
      if (s) localStorage.setItem('serviq.provider', s)
    }, [hit.token, hit.refresh, slug])
    await page.reload()
    await page.waitForTimeout(1000)
    if (!page.url().includes('/login')) {
      console.log(`  login reused JWT for ${user}`)
      return
    }
    // Token rejected (world rebuilt under us) — fall through to the form.
  }
  await page.goto(slug ? `${base}/provider/${slug}/login` : `${base}/login`)
  await fillLogin(page, user, pass)
  for (let attempt = 0; attempt < 4; attempt++) {
    await paceAuth()
    await page.getByRole('button', { name: /sign in/i }).click()
    try {
      await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
      await stashToken(page, user)
      return
    } catch {
      const alerts = await alertsOf(page)
      if (alerts.some((a) => /too many/i.test(a))) {
        console.log(`  login throttled for ${user} — waiting out the limiter`)
        await page.waitForTimeout(65000)
        continue
      }
      if (alerts.length) throw new Error(`login rejected for ${user}: ${alerts.join(' | ')}`)
      if (attempt >= 2) throw new Error(`login stalled for ${user} — no navigation, no error`)
    }
  }
  throw new Error(`login still throttled for ${user} after retries`)
}

// Signup shares the IAM register/login throttle (5/min per IP) — suites
// batch signups from one container, so back off on "Too Many Attempts"
// and resubmit rather than failing the flow. Returns when the page
// navigates off the signup form.
export async function signupSubmit(page, buttonName = 'Sign up') {
  for (let attempt = 0; attempt < 4; attempt++) {
    await paceAuth()
    await page.getByRole('button', { name: buttonName }).click()
    try {
      await page.waitForURL((u) => !u.pathname.includes('signup'), { timeout: 20000 })
      return
    } catch {
      const alerts = await alertsOf(page)
      if (alerts.some((a) => /too many/i.test(a))) {
        console.log(`  signup throttled — waiting out the limiter`)
        await page.waitForTimeout(65000)
        continue
      }
      if (alerts.length) throw new Error(`signup rejected: ${alerts.join(' | ')}`)
    }
  }
  throw new Error('signup still throttled after retries')
}

// Expect a login to be refused; returns the error text shown. Waits out
// the limiter so a throttle isn't mistaken for the rejection under test.
export async function loginRejected(page, base, user, { pass = PASS, slug = TENANT } = {}) {
  await page.goto(slug ? `${base}/provider/${slug}/login` : `${base}/login`)
  await fillLogin(page, user, pass)
  for (let attempt = 0; attempt < 3; attempt++) {
    await paceAuth()
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.locator('[role="alert"], .MuiAlert-root, .text-red-700').first().waitFor({ timeout: 20000 })
    const text = (await alertsOf(page)).join(' | ')
    if (!/too many/i.test(text)) {
      if (!page.url().includes('/login')) throw new Error(`login for ${user} unexpectedly succeeded`)
      return text
    }
    console.log(`  login throttled for ${user} — waiting out the limiter`)
    await page.waitForTimeout(65000)
  }
  throw new Error(`login still throttled for ${user} after retries`)
}

// Poll an in-app view that loads once per mount: hop away and back until
// `target` is visible.
export async function reenter(page, away, back, target, { tries = 25, every = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (await target.first().isVisible().catch(() => false)) return
    await page.waitForTimeout(every)
    await away()
    await back()
    await target.first().waitFor({ timeout: 4000 }).catch(() => {})
  }
  await target.first().waitFor({ timeout: 5000 })
}

const consoleNav = (page, name) => page.getByRole('link', { name, exact: true }).click()
export const consoleGo = consoleNav

// Customer: first-login profile gate (if shown) then the home CTA.
// The gate renders only after the async /me/profile check resolves — a
// 404 gets CompleteProfile, success gets the service grid, other errors
// get an alert. Race those mutually exclusive states; the nav CTA is
// always mounted and can't be the signal.
export async function customerHome(cp) {
  const gate = cp.getByText(/one last step/i)
  const ready = cp.getByRole('heading', { name: 'Book a service' })
    .or(cp.locator('.MuiAlert-standardError'))
  await Promise.race([
    gate.waitFor({ timeout: 15000 }),
    ready.waitFor({ timeout: 15000 }),
  ]).catch(() => {})
  if (await gate.isVisible().catch(() => false)) {
    await cp.getByLabel(/full name/i).fill('Jane Customer')
    await cp.getByRole('button', { name: /continue/i }).click()
    ok('profile gate completed')
  }
  const cta = cp.getByRole('link', { name: /browse services|book a service/i }).first()
  await cta.waitFor({ timeout: 15000 })
  return cta
}

// Customer books the first catalog service; the marker goes into the
// street and notes so later portals can find this booking. Returns the
// request id. Leaves the page on the request detail.
export async function book(cp, marker) {
  await cp.getByRole('link', { name: 'Home', exact: true }).first().click().catch(() => {})
  await customerHome(cp)
  // Home's service cards link straight into the form at /book/:serviceId.
  await cp.getByRole('link', { name: 'Book', exact: true }).first().click()
  await cp.waitForURL(/\/book\//, { timeout: 10000 })
  // Availability decides the date picker — arm the probe before it can
  // resolve so the swap from plain inputs to MiniCalendar can't race us.
  const avail = cp.waitForResponse((r) => r.url().includes('/availability'), { timeout: 15000 }).catch(() => null)
  await select(cp, 'Address', /new address/i)
  await cp.getByLabel(/street/i).fill(`${marker} Street`)
  // Cascading PSGC pickers: city search (debounced 500ms) then barangay
  // children. "Manila" resolves to a single city; coverage preflights on
  // the barangay pick (the tenant's service area covers nationwide).
  await cp.getByLabel('City / municipality').fill('Manila')
  await cp.getByRole('option', { name: /City of Manila/ }).click()
  await cp.getByLabel('Barangay').pressSequentially('Bin')
  await cp.getByRole('option', { name: /Binondo/ }).click()
  await avail
  const dateInput = cp.locator('input[type="date"]')
  // +1 day is always inside the availability window; at month-end it may
  // live on the next MiniCalendar view.
  const tomorrow = new Date(Date.now() + 86400000)
  if (await dateInput.count()) {
    await dateInput.fill(tomorrow.toISOString().slice(0, 10))
  } else {
    const label = tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const dayBtn = cp.getByRole('button', { name: label, exact: true })
    if (!(await dayBtn.count())) await cp.getByRole('button', { name: 'Next month' }).click()
    await dayBtn.click()
  }
  await cp.getByLabel('Notes for the technician').fill(marker)
  await cp.getByRole('button', { name: /submit request/i }).click()
  await cp.waitForURL(/\/requests\//, { timeout: 20000 })
  return cp.url().split('/').pop()
}

// Dispatcher: convert the marked request and land on the new job's detail
// page. The request detail gains a "View job →" link once the job has
// projected — reload until it renders. Returns the job id.
export async function convertToJobDetail(dp, marker) {
  await consoleNav(dp, 'Service requests')
  const row = dp.locator('button', { hasText: marker }).first()
  await reenter(dp, () => consoleNav(dp, 'Jobs'), () => consoleNav(dp, 'Service requests'), row)
  await row.click()
  await dp.getByRole('button', { name: /convert to job/i }).click()
  await dp.getByText(/hand-off/i).first().waitFor({ timeout: 15000 })
  const viewJob = dp.getByRole('link', { name: /view job/i })
  for (let i = 0; i < 20 && !(await viewJob.count()); i++) {
    await dp.waitForTimeout(2000)
    await dp.reload()
  }
  await viewJob.click()
  await dp.waitForURL(/\/dispatch\/jobs\//, { timeout: 10000 })
  return dp.url().split('/').pop()
}

// Dispatcher: convert the marked request, then confirm + release the job
// from its detail page. Returns the job id.
export async function convertAndRelease(dp, marker) {
  const jobId = await convertToJobDetail(dp, marker)
  await dp.getByRole('button', { name: 'Confirm job' }).click()
  await dp.getByText('Job confirmed.').waitFor({ timeout: 15000 })
  await dp.getByRole('button', { name: 'Mark ready for assignment' }).click()
  await dp.getByText('Released for assignment.').waitFor({ timeout: 15000 })
  return jobId
}

// Open a job's dedicated detail page (direct goto — the session token
// persists in sessionStorage).
export const openJob = (dp, jobId) => dp.goto(`${BASE.console}/dispatch/jobs/${jobId}`)

// Wait for the projection to move a job to a status — polls the Status
// row on its detail page.
export async function waitJobStatus(dp, jobId, status) {
  const dd = dp.locator('xpath=//dt[normalize-space()="Status"]/following-sibling::dd[1]')
  for (let i = 0; i < 25; i++) {
    await openJob(dp, jobId)
    // The page renders a loader until the fetch lands — wait for the row
    // to mount before judging its text, else the next reload aborts it.
    await dd.waitFor({ timeout: 8000 }).catch(() => {})
    if (await dd.filter({ hasText: status }).count()) return
    await dp.waitForTimeout(2000)
  }
  throw new Error(`job ${jobId} never reached ${status}`)
}

// 1×1 PNG — a stand-in receipt/photo. The AI can't read it, so payment
// evidence built on it lands `flagged` (low confidence) for human review.
export const PNG = {
  name: 'receipt.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
}

export const peso = (text) => Number(String(text).replace(/[^0-9.]/g, ''))

// Agent: open the marked job, check in, run every workflow step, complete.
export async function completeJob(ap, marker) {
  const card = ap.locator('a[href*="/jobs/"]', { hasText: marker })
  await reenter(ap,
    () => ap.getByRole('link', { name: 'Cash turn-in' }).click(),
    () => ap.getByRole('link', { name: 'Home' }).click(),
    card.first())
  await card.first().click()
  await ap.getByRole('button', { name: 'Check in on site' }).click()
  await ap.getByRole('button', { name: 'Complete job' }).waitFor({ timeout: 15000 })
  for (let i = 0; i < 20; i++) {
    const start = ap.getByRole('button', { name: 'Start', exact: true }).first()
    const close = ap.getByRole('button', { name: 'Close', exact: true }).first()
    // The step dialog closes itself when the action resolves — a disabled
    // mid-flight Close detaches under the click, which is success, not error.
    if (await close.isVisible().catch(() => false)) await close.click({ timeout: 5000 }).catch(() => {})
    else if (await start.isVisible().catch(() => false)) await start.click()
    else break
    await ap.waitForTimeout(800)
  }
  await ap.getByRole('button', { name: 'Complete job' }).click()
  await ap.getByRole('button', { name: 'Complete', exact: true }).click()
}

// Agent: record cash on the completed job's invoice (Billing issues it on
// Job.Completed; the page polls for it).
export async function collectCash(ap) {
  await ap.getByRole('button', { name: 'Collected cash' }).click({ timeout: 45000 })
  await ap.getByRole('button', { name: 'Record cash' }).click()
  await ap.getByText('Cash collection recorded').waitFor({ timeout: 15000 })
  await ap.getByText('Invoice Paid.').waitFor({ timeout: 15000 })
}

// Agent: open Cash turn-in, return the expected total text.
export async function openTurnIn(ap) {
  await ap.getByRole('link', { name: 'Home' }).click()
  await ap.getByRole('link', { name: 'Cash turn-in' }).click()
  const total = ap.getByText('Expected total').locator('xpath=following-sibling::*[1]')
  await total.waitFor({ timeout: 15000 })
  return (await total.textContent()).trim()
}

// Agent: hand over `amount` pesos against the expected total.
export async function turnIn(ap, amount) {
  await ap.getByLabel('Counted cash on hand (₱)').fill(String(amount))
  await ap.getByRole('button', { name: 'Submit turn-in' }).click()
  await ap.getByRole('button', { name: 'Submit', exact: true }).click()
  await ap.getByText(/Turn-in submitted/).waitFor({ timeout: 15000 })
}

// Dispatcher: apply `action` (Confirm | Override | Accept shortfall |
// Reject) to the newest reviewable remittance of `kind`.
export async function reviewRemittance(dp, kind, action = 'Confirm') {
  await consoleNav(dp, 'Jobs')
  await consoleNav(dp, 'Remittances')
  const rows = dp.locator('tr', { hasText: kind }).filter({ has: dp.getByRole('button', { name: action, exact: true }) })
  await rows.first().waitFor({ timeout: 15000 })
  const before = await rows.count()
  await rows.first().getByRole('button', { name: action, exact: true }).click()
  for (let i = 0; i < 20 && (await rows.count()) >= before; i++) await dp.waitForTimeout(500)
  if ((await rows.count()) >= before) throw new Error(`${kind} remittance: ${action} did not apply`)
}
