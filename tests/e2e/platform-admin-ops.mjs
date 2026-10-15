// Platform Admin ops E2E — the platform surfaces the tenant-lifecycle
// script doesn't touch: plan catalog, subscription assignment on tenant
// detail, feature flags, platform users & roles (create, disable/enable,
// permission grant), and the income/settlement report. (The Settings &
// Policies surface was dropped from the platform admin in the demo rework.)
// All writes create throwaway `e2e-` records; nothing global is deleted.
import { BASE, run, ok, mark, newPage, login, field } from './lib/harness.mjs'

const SLUG = mark('e2e').toLowerCase()
const PLATFORM_API = `http://${process.env.API_HOST || 'host.docker.internal'}:8011`

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
  // Features are structured limits (JSONB map) — per-key number inputs,
  // not a comma-separated text field.
  await p.locator('xpath=//span[normalize-space()="Max agents"]/following::input[1]').fill('25')
  await p.getByRole('button', { name: 'Create plan' }).click()
  const planRow = p.locator('tr', { hasText: `e2e-${SLUG}` })
  await planRow.waitFor({ timeout: 15000 })
  ok('plan created')

  await planRow.getByRole('button', { name: 'Edit' }).click()
  await field(p, 'Name').fill(`E2E Plan ${SLUG} Pro`)
  await p.getByRole('button', { name: 'Save plan' }).click()
  await p.locator('tr', { hasText: `E2E Plan ${SLUG} Pro` }).waitFor({ timeout: 15000 })
  ok('plan edited')

  // ── Subscription — assign the new plan to a throwaway tenant ─────────
  await nav('Service Providers')
  await p.getByRole('button', { name: 'New provider' }).click()
  await field(p, 'Business name').fill(`E2E Sub Tenant ${SLUG}`)
  await field(p, 'Slug').fill(`sub-${SLUG}`)
  await p.getByRole('button', { name: 'Create provider' }).click()
  // Creating opens the new tenant's detail page directly.
  await p.getByRole('heading', { name: `E2E Sub Tenant ${SLUG}` }).waitFor({ timeout: 15000 })
  await p.locator('select').first().selectOption({ label: `E2E Plan ${SLUG} Pro` })
  await p.getByRole('button', { name: 'Save subscription' }).click()
  await p.getByText('Subscription saved.').waitFor({ timeout: 15000 })
  await p.getByText(`On E2E Plan ${SLUG} Pro (active)`).waitFor({ timeout: 15000 })
  ok('subscription assigned on tenant detail')

  // ── Feature flags — enable/disable ───────────────────────────────────
  // The page is toggle-only now ("gates ship with the codebase, not this
  // page") — the throwaway flag is upserted via the admin API (same
  // documented exception as bootstrap's company accounts), then toggled
  // through the real UI.
  const adminToken = await p.evaluate(
    () => sessionStorage.getItem('serviq.token') || localStorage.getItem('serviq.token')
  )
  const flagRes = await fetch(`${PLATFORM_API}/api/v1/feature-flags`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ key: `e2e.${SLUG}`, enabled: false, description: 'e2e flag' }),
  })
  if (!flagRes.ok) throw new Error(`flag upsert failed: ${flagRes.status}`)
  await nav('Feature Flags')
  const flagRow = p.locator('tr', { hasText: `e2e.${SLUG}` })
  await flagRow.waitFor({ timeout: 15000 })
  ok('feature flag seeded via API — row renders')

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

  // Disable → enable on the created user's row. The status badge reads
  // "disabled"/"active" while the action button reads "Enable"/"Disable",
  // so row-level hasText filters stay unambiguous.
  const userRow = p.locator('tr', { has: p.locator('td', { hasText: user }) })
  await userRow.getByRole('button', { name: 'Disable' }).click()
  await userRow.filter({ hasText: 'disabled' }).waitFor({ timeout: 15000 })
  ok('platform user disabled')
  await userRow.getByRole('button', { name: 'Enable' }).click()
  await userRow.filter({ hasText: 'active' }).waitFor({ timeout: 15000 })
  ok('platform user re-enabled')

  await p.getByRole('button', { name: 'New role' }).click()
  await field(p, 'Role name').fill(`E2E Role ${SLUG}`)
  await p.locator('label', { has: p.locator('input[type="checkbox"]') }).first().locator('input').check()
  await p.getByRole('button', { name: 'Create role' }).click()
  await p.getByText(`E2E Role ${SLUG}`).waitFor({ timeout: 15000 })
  ok('platform role created')

  // Grant an additional permission through the role's Permissions panel —
  // the grant form closes on success.
  const roleBlock = p.locator('div.rounded-lg.border', { hasText: `E2E Role ${SLUG}` })
  await roleBlock.getByRole('button', { name: /Permissions/ }).click()
  await roleBlock.locator('input[type="checkbox"]').first().check()
  await roleBlock.getByRole('button', { name: 'Grant selected' }).click()
  await roleBlock.getByRole('button', { name: 'Grant selected' }).waitFor({ state: 'hidden', timeout: 15000 })
  ok('permission granted to e2e role')

  // ── Income & settlement — report renders ─────────────────────────────
  await nav('Income & Settlement')
  await p.getByRole('heading', { name: 'Income & settlement' }).waitFor({ timeout: 15000 })
  // The <th>s carry no scope= so they aren't exposed as `columnheader` —
  // match the cell directly; the header row only exists once the report
  // has loaded (the "Platform fee income" description text renders early).
  await p.locator('th', { hasText: 'Settlement' }).first().waitFor({ timeout: 15000 })
  await p.getByText('Platform fee income').or(p.getByText('No subscriptions on record.')).first()
    .waitFor({ timeout: 15000 })
  ok('income & settlement report rendered')
})
