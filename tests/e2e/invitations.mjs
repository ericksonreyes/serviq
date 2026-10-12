// Onboarding E2E — every way an account gets created through the UI:
//   A) dispatcher invites an agent → rendered accept link → invited signup
//      on the agent portal → lands on agent home;
//   B) admin creates a customer record, then invites the customer →
//      accept link → invited signup on the customer portal → home;
//   C) agent self-signup on the tenant link → agent home;
//   D) provider self-registration on the console → "Organization created"
//      → admin signs in under the new tenant slug.
// The accept link is surfaced by InviteForm (accept_url) — no email or DB
// needed. page.goto is safe here: the no-goto rule only applies post-login.
import {
  BASE, PASS, TENANT, run, ok, mark, newPage, login, field, consoleGo,
  customerHome,
} from './lib/harness.mjs'

// Console → send an invite, return the rendered accept link href.
async function invite(dp, nav, email) {
  await consoleGo(dp, nav)
  await dp.locator('input[type="email"]').last().fill(email)
  await dp.getByRole('button', { name: 'Send invite' }).click()
  const a = dp.locator('a[href*="invite="]')
  await a.waitFor({ timeout: 15000 })
  return a.getAttribute('href')
}

// Both portal signups prefill from ?invite=<token> and show the invite banner.
async function acceptInvite(page, link, user) {
  await page.goto(link)
  await page.getByText(/You were invited by/).waitFor({ timeout: 15000 })
  await page.getByLabel('Full name').fill(`E2E ${user}`)
  await page.getByLabel('Username').fill(user)
  await page.getByLabel(/^Password/).fill(PASS)
  await page.getByLabel('Confirm password').fill(PASS)
  await page.getByRole('button', { name: 'Sign up' }).click()
}

await run('ONBOARDING', async (browser) => {
  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')
  const MARK = mark('e2e').toLowerCase()

  // ── A: agent invitation → invited signup → agent home ────────────────
  const agentLink = await invite(dp, 'Service agents', `${MARK}.agent@example.test`)
  const ap = await newPage(browser)
  await acceptInvite(ap, agentLink, `${MARK}.agent`)
  await ap.getByText(/Assignment offers|No open offers/).first().waitFor({ timeout: 15000 })
  ok('invited agent accepted and landed on agent home')

  // ── B: customer record + invitation → invited signup → portal home ───
  await consoleGo(dp, 'Customers')
  await field(dp, 'Name').fill(`E2E Cust ${MARK}`)
  await field(dp, 'Address').fill(`${MARK} Street`)
  await field(dp, 'City').fill('E2E City')
  await dp.getByRole('button', { name: 'Create customer' }).click()
  await dp.getByText(`Customer E2E Cust ${MARK} created.`).waitFor({ timeout: 15000 })
  await dp.locator('tr', { hasText: `E2E Cust ${MARK}` }).first().waitFor({ timeout: 15000 })
  ok('customer record created from the console')

  const custLink = await invite(dp, 'Customers', `${MARK}.cust@example.test`)
  const cp = await newPage(browser)
  await acceptInvite(cp, custLink, `${MARK}.cust`)
  await customerHome(cp)
  ok('invited customer accepted and landed on portal home')

  // ── C: agent self-signup on the tenant link ──────────────────────────
  const ap2 = await newPage(browser)
  const selfUser = `${MARK}.self`
  await ap2.goto(`${BASE.agent}/provider/${TENANT}/signup`)
  await ap2.getByLabel('Full name').fill(`E2E ${selfUser}`)
  await ap2.getByLabel('Username').fill(selfUser)
  await ap2.getByLabel('Email').fill(`${selfUser}@example.test`)
  await ap2.getByLabel(/^Password/).fill(PASS)
  await ap2.getByLabel('Confirm password').fill(PASS)
  await ap2.getByRole('button', { name: 'Sign up' }).click()
  await ap2.getByText(/Assignment offers|No open offers/).first().waitFor({ timeout: 15000 })
  ok('self-registered agent landed on agent home')

  // ── D: provider self-registration → sign in under the new slug ───────
  const pp = await newPage(browser)
  const slug = `e2e-org-${MARK}`
  await pp.goto(`${BASE.console}/signup`)
  await field(pp, 'Organization name').fill(`E2E Org ${MARK}`)
  await field(pp, 'Slug').fill(slug)
  await field(pp, 'Your name').fill(`Org Admin ${MARK}`)
  await field(pp, 'Username').fill(`${MARK}.admin`)
  await field(pp, 'Email').fill(`${MARK}.admin@example.test`)
  await field(pp, 'Password').fill(PASS)
  await field(pp, 'Confirm password').fill(PASS)
  await pp.getByRole('button', { name: 'Create organization' }).click()
  await pp.getByText('Organization created').waitFor({ timeout: 20000 })
  ok(`provider ${slug} self-registered`)

  // Pending tenants may or may not be allowed to sign in — the assertion
  // pins the decision: either way the flow must not hang on /login forever.
  await login(pp, BASE.console, `${MARK}.admin`, { slug })
  ok('new org admin signed in under the pending tenant')
})
