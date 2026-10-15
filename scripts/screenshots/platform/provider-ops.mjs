// Capture: platform admin console — the operator tier that onboards
// tenants. Desktop viewport. States: login → dashboard → provider list →
// provider detail → plans → income/settlement.
import { capture, settled, login, BASE } from '../lib/capture.mjs'

await capture('platform', async ({ desktop, shot }) => {
  const p = await desktop()

  await p.goto(`${BASE.platform}/login`)
  await shot(p, '01-login')

  await login(p, BASE.platform, 'admin', { pass: 'serviq-local', slug: null })
  await settled(p)
  await shot(p, '02-dashboard')

  await p.getByRole('link', { name: 'Service Providers' }).click()
  await settled(p)
  await shot(p, '03-providers')

  // count() doesn't auto-wait — waitFor the row before deciding to skip.
  const acme = p.getByRole('link', { name: /acme/i }).first()
  try {
    await acme.waitFor({ timeout: 8000 })
    await acme.click()
    await settled(p)
    await shot(p, '04-provider-detail')
    await p.getByRole('link', { name: 'Service Providers' }).click()
    await settled(p)
  } catch { /* no tenant link rendered — skip detail shot */ }

  await p.getByRole('link', { name: 'Plans & Subscriptions' }).click()
  await settled(p)
  await shot(p, '05-plans')

  await p.getByRole('link', { name: 'Income & Settlement' }).click()
  await settled(p)
  await shot(p, '06-income')
})
