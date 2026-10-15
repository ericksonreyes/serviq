// Customer self-service + agent field tools E2E:
//   new customer signs up on the tenant link → manages the address book
//   (add / edit / delete) → books and cancels a request → sees only their
//   own notifications; agent opens a live job → navigation link targets the
//   customer address → captures the customer's typed-name confirmation.
import {
  BASE, TENANT, PASS, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  customerHome, reenter, signupSubmit,
} from './lib/harness.mjs'

await run('CUSTOMER SELF-SERVICE', async (browser) => {
  const user = `e2e${Date.now()}`
  const cp = await newPage(browser)
  await cp.goto(`${BASE.customer}/provider/${TENANT}/signup`)
  await cp.getByLabel('Full name').fill(`E2E ${user}`)
  await cp.getByLabel('Username').fill(user)
  await cp.getByLabel('Email').fill(`${user}@example.test`)
  await cp.getByLabel(/^Password/).fill(PASS)
  await cp.getByLabel('Confirm password').fill(PASS)
  await signupSubmit(cp)
  await customerHome(cp)
  ok(`customer ${user} signed up and landed home`)

  // ── Address book ─────────────────────────────────────────────────────
  await cp.getByRole('link', { name: 'Profile' }).click()
  await cp.getByRole('button', { name: 'Add address' }).click()
  await cp.getByLabel('Label (Home, Office…)').fill('Home')
  await cp.getByLabel('Street / house no.').fill(`${user} Street`)
  await cp.getByLabel('Barangay / district').fill('Poblacion')
  await cp.getByLabel('City').fill('E2E City')
  await cp.getByRole('button', { name: 'Save' }).click()
  await cp.getByText(`${user} Street`).first().waitFor({ timeout: 15000 })
  ok('address added')
  await cp.getByRole('button', { name: 'Edit' }).first().click()
  await cp.getByLabel('Label (Home, Office…)').fill('Office')
  await cp.getByRole('button', { name: 'Save' }).click()
  await cp.getByText('Office').first().waitFor({ timeout: 15000 })
  ok('address edited')
  await cp.getByRole('button', { name: 'Delete' }).first().click()
  await cp.getByText(`${user} Street`).waitFor({ state: 'detached', timeout: 15000 })
  ok('address deleted')

  // ── Book then cancel ─────────────────────────────────────────────────
  const m = mark('E2E-CXL')
  await book(cp, m)
  await cp.getByRole('button', { name: 'Cancel request' }).click()
  await cp.getByText(/cancelled/i).first().waitFor({ timeout: 15000 })
  ok('customer cancelled the request before dispatch')

  // ── Notifications: own request receipt, no staff traffic ─────────────
  const bell = () => cp.getByRole('link', { name: 'Notifications' }).click()
  const receipt = cp.getByText('Request submitted')
  await reenter(cp, () => cp.getByRole('link', { name: 'Profile' }).click(), bell, receipt)
  if (await cp.getByText(/You are invited|Tenant|Step started|PaymentEvidence/).count()) {
    throw new Error('staff notifications leaked to a customer')
  }
  ok('notifications page lists the customer\'s own request receipt only')

  // ── Agent: navigation + customer confirmation ────────────────────────
  const jp = await newPage(browser)
  await login(jp, BASE.customer, 'jane.customer')
  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')
  const ap = await newPage(browser)
  await login(ap, BASE.agent, 'anna.agent')
  const nm = mark('E2E-NAV')
  await book(jp, nm)
  const jobId = await convertAndRelease(dp, nm)
  await waitJobStatus(dp, jobId, /assigned|accepted/)
  const card = ap.locator('a[href*="/jobs/"]', { hasText: nm })
  await reenter(ap, () => ap.getByRole('link', { name: 'Cash turn-in' }).click(),
    () => ap.getByRole('link', { name: 'Home' }).click(), card)
  await card.first().click()
  const nav = ap.getByRole('link', { name: 'Navigate to customer' })
  const href = await nav.getAttribute('href')
  if (!href.startsWith('https://www.google.com/maps/dir/') || !decodeURIComponent(href).includes(`${nm} Street`)) {
    throw new Error(`navigation link does not target the customer: ${href}`)
  }
  ok('navigation link targets the customer address')
  await ap.getByRole('button', { name: 'Check in on site' }).click()
  await ap.getByLabel('Customer name').fill('Jane Customer')
  await ap.getByRole('button', { name: 'Capture confirmation' }).click()
  await ap.getByText('Customer confirmation captured.').waitFor({ timeout: 15000 })
  await ap.getByText('Customer confirmation — Jane Customer').waitFor({ timeout: 15000 })
  ok('agent captured the customer confirmation signature')
})
