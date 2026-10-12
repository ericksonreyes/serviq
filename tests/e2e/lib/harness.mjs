// Shared E2E harness — browser launch, login with throttle back-off, and
// the multi-portal steps every persona flow reuses. Lives in lib/ so the
// runner's top-level `*.mjs` glob doesn't execute it as a test.
//
// Environment facts (see workspace/specs/testing/README.MD):
//  - Frontends bake VITE_* = localhost:PORT — --host-resolver-rules maps
//    the browser's localhost to the Docker host gateway.
//  - Tokens live in React state — full-page goto loses auth, so all
//    navigation after login is in-app clicks.
import { chromium } from 'playwright'
import dns from 'node:dns/promises'

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
  const userInput = (await page.getByLabel('Username').count()) > 0 ? page.getByLabel('Username') : page.locator('input').first()
  const passInput = (await page.getByLabel('Password').count()) > 0 ? page.getByLabel('Password') : page.locator('input[type="password"]')
  await userInput.fill(user)
  await passInput.fill(pass)
}

const alertsOf = (page) =>
  page.locator('[role="alert"], .MuiAlert-root, .text-red-700').allTextContents().catch(() => [])

// Tenant users log in under /provider/<slug>/login; platform staff use
// bare /login. IAM throttles 5 logins/min per client IP — back off and
// retry on "Too Many Attempts" rather than failing.
export async function login(page, base, user, { pass = PASS, slug = TENANT } = {}) {
  await page.goto(slug ? `${base}/provider/${slug}/login` : `${base}/login`)
  await fillLogin(page, user, pass)
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole('button', { name: /sign in/i }).click()
    try {
      await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
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

// Expect a login to be refused; returns the error text shown. Waits out
// the limiter so a throttle isn't mistaken for the rejection under test.
export async function loginRejected(page, base, user, { pass = PASS, slug = TENANT } = {}) {
  await page.goto(slug ? `${base}/provider/${slug}/login` : `${base}/login`)
  await fillLogin(page, user, pass)
  for (let attempt = 0; attempt < 3; attempt++) {
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
export async function customerHome(cp) {
  const gate = cp.getByText(/one last step/i)
  const cta = cp.getByRole('link', { name: /browse services|book a service/i }).first()
  await Promise.race([gate.waitFor({ timeout: 15000 }), cta.waitFor({ timeout: 15000 })]).catch(() => {})
  if (await gate.isVisible().catch(() => false)) {
    await cp.getByLabel(/full name/i).fill('Jane Customer')
    await cp.getByRole('button', { name: /continue/i }).click()
    ok('profile gate completed')
  }
  await cta.waitFor({ timeout: 15000 })
  return cta
}

// Customer books the first catalog service; the marker goes into the
// street and notes so later portals can find this booking. Returns the
// request id. Leaves the page on the request detail.
export async function book(cp, marker) {
  await cp.getByRole('link', { name: 'Home', exact: true }).first().click().catch(() => {})
  const cta = await customerHome(cp)
  await cta.click()
  await cp.getByRole('link', { name: 'Book', exact: true }).first().click()
  await cp.waitForURL(/\/book\//, { timeout: 10000 })
  await select(cp, 'Address', /new address/i)
  await cp.getByLabel(/street/i).fill(`${marker} Street`)
  await cp.getByLabel('City').fill('E2E City')
  await cp.getByLabel('Preferred date').fill('2026-10-20')
  await cp.getByLabel('Notes for the technician').fill(marker)
  await cp.getByRole('button', { name: /submit request/i }).click()
  await cp.waitForURL(/\/requests\//, { timeout: 20000 })
  return cp.url().split('/').pop()
}

// Dispatcher: convert the marked request, then confirm + release the job
// from the Jobs monitor. Returns the job id.
export async function convertAndRelease(dp, marker, requestId) {
  await consoleNav(dp, 'Service requests')
  const row = dp.locator('button', { hasText: marker }).first()
  await reenter(dp, () => consoleNav(dp, 'Jobs'), () => consoleNav(dp, 'Service requests'), row)
  await row.click()
  await dp.getByRole('button', { name: /convert to job/i }).click()
  await dp.getByText(/hand-off/i).first().waitFor({ timeout: 15000 })

  await consoleNav(dp, 'Jobs')
  const jobId = await findJobForRequest(dp, requestId, /requested/)
  await dp.getByRole('button', { name: 'Confirm job' }).click()
  await dp.getByText('Job confirmed.').waitFor({ timeout: 15000 })
  await dp.getByRole('button', { name: 'Mark ready for assignment' }).click()
  await dp.getByText('Released for assignment.').waitFor({ timeout: 15000 })
  return jobId
}

// Select the Jobs-monitor row whose detail shows this request id.
export async function findJobForRequest(dp, requestId, status) {
  for (let i = 0; i < 20; i++) {
    for (const btn of await dp.locator('ul button', { hasText: status }).all()) {
      await btn.click()
      if (await dp.locator('dd', { hasText: requestId }).waitFor({ timeout: 3000 }).then(() => true).catch(() => false)) {
        return (await btn.locator('span.font-mono').textContent()).trim()
      }
    }
    await dp.waitForTimeout(2000)
    await consoleNav(dp, 'Service requests')
    await consoleNav(dp, 'Jobs')
    await dp.locator('ul button').first().waitFor({ timeout: 5000 }).catch(() => {})
  }
  throw new Error(`no ${status} job for request ${requestId} in the Jobs monitor`)
}

// Jobs monitor row for a job, filtered by status text.
export const jobRow = (dp, jobId, status) => dp.locator('ul button', { hasText: jobId }).filter({ hasText: status })

export async function waitJobStatus(dp, jobId, status) {
  await reenter(dp, () => consoleNav(dp, 'Service requests'), () => consoleNav(dp, 'Jobs'), jobRow(dp, jobId, status))
}

// 1×1 PNG — a stand-in receipt/photo. The AI can't read it, so payment
// evidence built on it lands `flagged` (low confidence) for human review.
export const PNG = {
  name: 'receipt.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
}
