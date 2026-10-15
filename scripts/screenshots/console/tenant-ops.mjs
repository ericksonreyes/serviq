// Capture: tenant console — admin setup + dispatch surfaces, desktop.
// States: login → overview → service catalog → agent roster → users →
// dispatch queue → remittances → payment evidence.
import { capture, settled, login, BASE } from '../lib/capture.mjs'

await capture('console', async ({ desktop, shot }) => {
  const p = await desktop()

  await p.goto(`${BASE.console}/provider/acme/login`)
  await shot(p, '01-login')

  await login(p, BASE.console, 'acme.admin')
  await settled(p)
  await shot(p, '02-overview')

  // Tenant admin setup surfaces.
  for (const [label, name] of [
    ['Service catalog', '03-service-catalog'],
    ['Service agents', '04-agent-roster'],
    ['Users & roles', '05-users-roles'],
  ]) {
    await p.getByRole('link', { name: label, exact: true }).first().click()
    await settled(p)
    await shot(p, name)
  }

  // Dispatcher surfaces — the journey's control room.
  for (const [label, name] of [
    ['Service requests', '06-requests'],
    ['Jobs', '07-jobs'],
    ['Remittances', '08-remittances'],
    ['Payment evidence', '09-evidence'],
  ]) {
    await p.getByRole('link', { name: label, exact: true }).first().click()
    await settled(p)
    await shot(p, name)
  }
})
