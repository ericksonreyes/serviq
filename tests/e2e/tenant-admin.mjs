// Tenant Admin — add a service agent, invite one by email, create a staff
// user, create a service type and edit its pricing.
import { BASE, run, ok, mark, newPage, login, field, consoleGo } from './lib/harness.mjs'

const MARK = mark('E2E-TA')

await run('TENANT ADMIN', async (browser) => {
  const p = await newPage(browser)
  await login(p, BASE.console, 'acme.admin')
  ok('tenant admin logged in')

  // List-first pages: the CTA swaps the form in over the table, and the
  // success notice unmounts with it — so each create asserts the reloaded
  // list row, not a flash message.
  await consoleGo(p, 'Service agents')
  await p.getByRole('button', { name: 'Add agent' }).click()
  await field(p, 'Name').fill(`Agent ${MARK}`)
  await field(p, 'Skills (comma-separated)').fill('plumbing')
  await p.getByRole('button', { name: 'Add agent', exact: true }).click()
  await p.getByText(`Agent ${MARK}`, { exact: true }).first().waitFor({ timeout: 15000 })
  ok('service agent added to roster')

  await p.getByRole('button', { name: 'Invite by email' }).click()
  await field(p, 'Email').fill(`${MARK.toLowerCase()}@example.test`)
  await p.getByRole('button', { name: 'Send invite' }).click()
  await p.getByText(/invit(e|ation)[^.]*(sent|queued|created)|invited|invite sent/i).first().waitFor({ timeout: 15000 })
  ok('agent invited by email')

  await consoleGo(p, 'Users & roles')
  const user = MARK.toLowerCase().replace(/-/g, '.')
  await p.getByRole('button', { name: 'New user' }).click()
  await field(p, 'Username').fill(user)
  await field(p, 'Temporary password').fill('demo-pass-123')
  // Any tenant role will do — the roles list comes from IAM for this tenant.
  await p.locator('label', { has: p.locator('input[type="checkbox"]') }).first().locator('input').check()
  await p.getByRole('button', { name: 'Create user' }).click()
  await p.getByText(user, { exact: true }).first().waitFor({ timeout: 15000 })
  ok('staff user created')

  await consoleGo(p, 'Service catalog')
  await p.getByRole('button', { name: 'New service' }).click()
  await field(p, 'Name').fill(`Service ${MARK}`)
  await p.getByRole('button', { name: 'Create service' }).click()
  await p.locator('button', { hasText: `Service ${MARK}` }).first().waitFor({ timeout: 15000 })
  ok('service type created')

  const row = p.locator('button', { hasText: `Service ${MARK}` }).first()
  await row.waitFor({ timeout: 15000 })
  await row.click()
  const price = p.locator('input[type="number"][step="0.01"]').first()
  await price.fill('1234.50')
  await p.getByRole('button', { name: 'Save pricing' }).click()
  await p.getByText('Pricing saved.').waitFor({ timeout: 15000 })
  ok('service pricing edited')
})
