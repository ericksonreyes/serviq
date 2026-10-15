// Capture: agent portal field workflow — mobile viewport (PWA channel).
// States: login → home → jobs list → job detail → cash turn-in form.
// Names map 1:1 onto docs/guides/agent.MD step references.
import { capture, settled, login, BASE } from '../lib/capture.mjs'

await capture('agent', async ({ mobile, shot }) => {
  const ap = await mobile()

  // 01 — tenant-scoped login
  await ap.goto(`${BASE.agent}/provider/acme/login`)
  await shot(ap, '01-login')

  await login(ap, BASE.agent, 'anna.agent')
  await settled(ap)
  await shot(ap, '02-home')

  // 03 — jobs list (in-app nav; tokens live in React state)
  await ap.getByRole('link', { name: 'Jobs', exact: true }).first().click()
  await settled(ap)
  await shot(ap, '03-jobs')

  // 04 — job detail (first card, if any jobs exist for the agent)
  const first = ap.locator('a[href^="/jobs/"], [href^="/jobs/"]').first()
  if (await first.count()) {
    await first.click()
    await settled(ap)
    await shot(ap, '04-job-detail')
  }

  // 05 — cash turn-in form (AppBar entry is a RouterLink → role 'link')
  await ap.getByRole('link', { name: /turn-in/i }).click()
  await settled(ap)
  await shot(ap, '05-turn-in')
})
