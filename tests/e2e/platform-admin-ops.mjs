// Platform Admin ops E2E — the platform surfaces the tenant-lifecycle
// script doesn't touch: plan catalog, feature flags, platform users &
// roles, platform settings, and the income/settlement report. All writes
// create throwaway `e2e-` records; nothing global is deleted.
import { BASE, run, ok, mark, newPage, login, field } from './lib/harness.mjs'

const SLUG = mark('e2e').toLowerCase()

await run('PLATFORM ADMIN OPS', async (browser) => {
  const p = await newPage(browser)
  await login(p, BASE.platform, 'admin', { pass: 'serviq-local', slug: null })
  ok('platform admin logged in')
  const nav = (name) => p.getByRole('link', { name, exact: true }).click()

  // ── Plans & subscriptions — create + edit a catalog plan ─────────────
  await nav('Plans & Subscriptions')
  await p.getByRole('button', { name: 'New plan' }).click()
  await field(p, 'Code').fill(`e2e-${SLUG}`)
  await field(p, 'Name').fill(`E2E Plan ${SLUG}`)
  await field(p, 'Price (cents)').fill('9900')
  await field(p, 'Features (comma-separated)').fill('dispatch, analytics')
  await p.getByRole('button', { name: 'Create plan' }).click()
  const planRow = p.locator('tr', { hasText: `e2e-${SLUG}` })
  await planRow.waitFor({ timeout: 15000 })
  ok('plan created')

  await planRow.getByRole('button', { name: 'Edit' }).click()
  await field(p, 'Name').fill(`E2E Plan ${SLUG} Pro`)
  await p.getByRole('button', { name: 'Save plan' }).click()
  await p.locator('tr', { hasText: `E2E Plan ${SLUG} Pro` }).waitFor({ timeout: 15000 })
  ok('plan edited')

  // ── Feature flags — add, enable, disable ─────────────────────────────
  await nav('Feature Flags')
  await field(p, 'Flag key').fill(`e2e.${SLUG}`)
  await field(p, 'Description').fill('e2e flag')
  await p.getByRole('button', { name: 'Add flag' }).click()
  const flagRow = p.locator('tr', { hasText: `e2e.${SLUG}` })
  await flagRow.waitFor({ timeout: 15000 })
  ok('feature flag added (disabled)')

  await flagRow.getByRole('button', { name: 'Enable' }).click()
  await flagRow.filter({ hasText: 'enabled' }).waitFor({ timeout: 15000 })
  ok('flag enabled')
  await flagRow.getByRole('button', { name: 'Disable' }).click()
  await flagRow.filter({ hasText: 'disabled' }).waitFor({ timeout: 15000 })
  ok('flag disabled')

  // ── Users & roles — platform-scope user + role ───────────────────────
  await nav('Users & Roles')
  await p.getByRole('button', { name: 'New user' }).click()
  const user = `ops.${SLUG}`
  await field(p, 'Username').fill(user)
  await field(p, 'Password (min 8)').fill('demo-pass-123')
  await field(p, 'Display name').fill(`E2E User ${SLUG}`)
  // Role pills are checkbox labels — take the first offered role.
  await p.locator('label', { has: p.locator('input[type="checkbox"]') }).first().click()
  await p.getByRole('button', { name: 'Create user' }).click()
  await p.locator('td', { hasText: user }).first().waitFor({ timeout: 15000 })
  ok('platform user created')

  await p.getByRole('button', { name: 'New role' }).click()
  await field(p, 'Role name').fill(`E2E Role ${SLUG}`)
  await p.locator('label', { has: p.locator('input[type="checkbox"]') }).first().locator('input').check()
  await p.getByRole('button', { name: 'Create role' }).click()
  await p.getByText(`E2E Role ${SLUG}`).waitFor({ timeout: 15000 })
  ok('platform role created')

  // ── Settings & policies — merge a marker key, keep existing keys ─────
  await nav('Settings & Policies')
  const settingsJson = p.locator('textarea')
  await settingsJson.waitFor({ timeout: 15000 })
  const current = JSON.parse((await settingsJson.inputValue()) || '{}')
  await settingsJson.fill(JSON.stringify({ ...current, e2e_marker: SLUG }, null, 2))
  await p.getByRole('button', { name: 'Save settings' }).click()
  await p.getByText('Settings saved.').waitFor({ timeout: 15000 })
  ok('platform settings saved (existing keys preserved)')

  // ── Income & settlement — report renders ─────────────────────────────
  await nav('Income & Settlement')
  await p.getByRole('heading', { name: 'Income & settlement' }).waitFor({ timeout: 15000 })
  await p.getByText('Platform fee income').or(p.getByText('No subscriptions on record.')).first()
    .waitFor({ timeout: 15000 })
  await p.getByRole('columnheader', { name: 'Settlement' }).waitFor({ timeout: 15000 })
  ok('income & settlement report rendered')
})
