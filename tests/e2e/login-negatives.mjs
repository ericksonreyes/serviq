// Login negatives — a wrong password and an unknown tenant slug are both
// refused with a visible error, and the user stays on the login page.
// Covers console, customer, agent, and platform-admin login forms.
import { BASE, run, ok, newPage, loginRejected } from './lib/harness.mjs'

await run('LOGIN NEGATIVES', async (browser) => {
  const p = await newPage(browser)
  const bad = await loginRejected(p, BASE.console, 'acme.admin', { pass: 'wrong-pass-123' })
  ok(`console wrong password refused — "${bad}"`)
  const slug = await loginRejected(p, BASE.customer, 'jane.customer', { slug: 'no-such-tenant-e2e' })
  ok(`unknown tenant slug refused — "${slug}"`)
  const agent = await loginRejected(p, BASE.agent, 'anna.agent', { pass: 'wrong-pass-123' })
  ok(`agent portal wrong password refused — "${agent}"`)
  const plat = await loginRejected(p, BASE.platform, 'admin', { pass: 'wrong-pass-123', slug: null })
  ok(`platform admin wrong password refused — "${plat}"`)
})
