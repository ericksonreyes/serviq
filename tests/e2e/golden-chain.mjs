// Golden-chain E2E — the canonical three-portal chain: customer books →
// dispatcher converts + confirms + releases → the tenant's `automatic`
// strategy assigns Anna → the agent sees the job and checks in.
import {
  BASE, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  reenter,
} from './lib/harness.mjs'

const MARK = mark('E2E')

await run('GOLDEN CHAIN', async (browser) => {
  // ── Leg 1: customer books a service ──────────────────────────────────
  const cp = await newPage(browser)
  await login(cp, BASE.customer, 'jane.customer')
  const requestId = await book(cp, MARK)
  ok(`customer booked — ${MARK} (request ${requestId.slice(0, 8)})`)

  // ── Leg 2: dispatcher converts + releases; auto-assign lands ─────────
  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')
  const jobId = await convertAndRelease(dp, MARK)
  ok(`job ${jobId.slice(0, 8)} confirmed + released via console UI`)

  await waitJobStatus(dp, jobId, /assigned|accepted/)
  ok('job projected, auto-assigned to Anna')

  // ── Leg 3: agent sees the job and checks in ───────────────────────────
  const ap = await newPage(browser)
  await login(ap, BASE.agent, 'anna.agent')
  // Job cards carry the booking address — the marker street binds this run.
  const card = ap.locator('a[href*="/jobs/"]', { hasText: MARK })
  await reenter(ap,
    () => ap.getByRole('link', { name: 'Jobs', exact: true }).click(),
    () => ap.getByRole('link', { name: 'Home', exact: true }).click(),
    card)
  await card.first().click()
  ok('job visible to agent')

  await ap.getByRole('button', { name: /check in/i }).waitFor({ timeout: 15000 })
  await ap.getByRole('button', { name: /check in/i }).click()
  ok('agent checked in — full chain green')
})
