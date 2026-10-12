// Platform Admin — login, metrics, tenant list, create a throwaway tenant
// and walk it activate → suspend → reactivate (never touches `acme`).
import { BASE, run, ok, mark, newPage, login, field } from './lib/harness.mjs'

const SLUG = mark('e2e').toLowerCase()

await run('PLATFORM ADMIN', async (browser) => {
  const p = await newPage(browser)
  p.on('dialog', (d) => d.accept())
  await login(p, BASE.platform, 'admin', { pass: 'serviq-local', slug: null })
  ok('platform admin logged in')

  for (const metric of ['Tenants', 'Subscriptions', 'IAM users']) {
    await p.getByText(metric, { exact: true }).first().waitFor({ timeout: 15000 })
  }
  ok('dashboard metrics rendered')

  await p.getByRole('link', { name: 'Tenants', exact: true }).click()
  await p.getByRole('link', { name: /acme/i }).first().waitFor({ timeout: 15000 })
  ok('tenant list shows acme')

  await p.getByRole('button', { name: 'New tenant' }).click()
  await field(p, 'Business name').fill(`E2E Tenant ${SLUG}`)
  await field(p, 'Slug').fill(SLUG)
  await p.getByRole('button', { name: 'Create tenant' }).click()
  // Creating opens the new tenant's detail page directly.
  await p.getByRole('heading', { name: `E2E Tenant ${SLUG}` }).waitFor({ timeout: 15000 })
  ok(`tenant ${SLUG} created (pending)`)

  const status = (s) => p.locator('dd', { hasText: new RegExp(`^${s}$`) }).first().waitFor({ timeout: 15000 })
  // New tenants start `pending`; activation is the first transition.
  await status('pending')
  await p.getByRole('button', { name: 'Activate', exact: true }).click()
  await status('active')
  ok('tenant activated')
  await p.getByRole('button', { name: 'Suspend', exact: true }).click()
  await status('suspended')
  ok('tenant suspended')
  await p.getByRole('button', { name: 'Activate', exact: true }).click()
  await status('active')
  ok('tenant reactivated')
})
