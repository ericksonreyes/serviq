// Dispatch strategies — dispatcher mode (manual assign, then cancel the
// job mid-flight) and broadcast mode (agent declines, accepts, and an
// offer expires). Restores the tenant to `automatic` however it ends.
import {
  BASE, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  reenter, consoleGo, openJob,
} from './lib/harness.mjs'

async function setStrategy(dp, strategy, ttl) {
  await consoleGo(dp, 'Business settings')
  await dp.locator('#dispatch-strategy').selectOption(strategy)
  if (ttl) await dp.locator('#dispatch-ttl').fill(String(ttl))
  await dp.getByRole('button', { name: 'Save strategy' }).click()
  await dp.getByText('Assignment strategy saved.').waitFor({ timeout: 15000 })
}

// The consumer's broadcast reads the persisted rule — re-open Settings
// until the saved values read back, so the next release can't see a
// stale TTL (the ttl field only renders under the broadcast strategy).
async function awaitRule(dp, strategy, ttl) {
  for (let i = 0; i < 15; i++) {
    await consoleGo(dp, 'Jobs')
    await consoleGo(dp, 'Business settings')
    const s = await dp.locator('#dispatch-strategy').inputValue()
    const t = await dp.locator('#dispatch-ttl').inputValue().catch(() => null)
    if (s === strategy && (!ttl || t === String(ttl))) return
    await dp.waitForTimeout(1500)
  }
  throw new Error(`dispatch rule did not persist ${strategy}/${ttl}`)
}

await run('DISPATCH STRATEGIES', async (browser) => {
  const cp = await newPage(browser)
  await login(cp, BASE.customer, 'jane.customer')
  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')
  const ap = await newPage(browser)
  await login(ap, BASE.agent, 'anna.agent')

  const release = async (tag) => {
    const m = mark(`E2E-${tag}`)
    await book(cp, m)
    return { m, jobId: await convertAndRelease(dp, m) }
  }
  const offer = (m) => ap.locator('.MuiCard-root', { has: ap.getByRole('button', { name: 'Accept' }) }).filter({ hasText: m })
  const agentHome = (target) => reenter(ap,
    () => ap.getByRole('link', { name: 'Jobs', exact: true }).click(),
    () => ap.getByRole('link', { name: 'Home', exact: true }).click(), target)

  try {
    // ── Dispatcher strategy: manual assignment, then cancel ────────────
    await setStrategy(dp, 'dispatcher')
    await awaitRule(dp, 'dispatcher')
    ok('strategy → dispatcher')
    const a = await release('DSP')
    await openJob(dp, a.jobId)
    await dp.getByRole('button', { name: 'Browse eligible agents' }).click()
    const pick = dp.locator('select', { has: dp.locator('option', { hasText: 'Pick an agent…' }) })
    await pick.locator('option', { hasText: /anna/i }).first().waitFor({ state: 'attached', timeout: 15000 })
    await pick.selectOption({ label: await pick.locator('option', { hasText: /anna/i }).first().textContent() })
    // Dispatch learns of the release via Job.ReadyForAssignment — the
    // assign POST 404s until the dispatchable_jobs projection lands. After
    // a fresh world build the consumer can be deep in backlog, so give it
    // a real budget, not a couple of seconds.
    for (let i = 0; ; i++) {
      await pick.locator('xpath=following-sibling::button').click()
      if (await dp.getByText('Agent assigned.').waitFor({ timeout: 5000 }).then(() => true, () => false)) break
      if (i >= 24) throw new Error('manual assignment never succeeded')
      await dp.waitForTimeout(2000)
    }
    await waitJobStatus(dp, a.jobId, /assigned|accepted/)
    ok(`job ${a.jobId.slice(0, 8)} manually assigned`)
    await openJob(dp, a.jobId)
    await dp.getByRole('button', { name: 'Cancel job' }).click()
    await dp.getByText('Job cancelled.').waitFor({ timeout: 15000 })
    ok('assigned job cancelled mid-flight')

    // ── Broadcast: decline, accept, expire ──────────────────────────────
    await setStrategy(dp, 'broadcast', 600)
    await awaitRule(dp, 'broadcast', 600)
    ok('strategy → broadcast (TTL 600s)')
    const b = await release('DECLINE')
    await agentHome(offer(b.m))
    await offer(b.m).first().getByRole('button', { name: 'Decline' }).click()
    await offer(b.m).first().waitFor({ state: 'detached', timeout: 15000 })
    ok('agent declined an offer')

    const c = await release('ACCEPT')
    await agentHome(offer(c.m))
    await offer(c.m).first().getByRole('button', { name: 'Accept' }).click()
    // Job cards show the customer's profile address, not the marker — the
    // offer leaving the list plus the console status is the proof.
    await offer(c.m).first().waitFor({ state: 'detached', timeout: 20000 })
    await waitJobStatus(dp, c.jobId, /assigned|accepted/)
    ok('agent accepted an offer → job assigned')

    await setStrategy(dp, 'broadcast', 5)
    await awaitRule(dp, 'broadcast', 5)
    ok('strategy → broadcast (TTL 5s)')
    const d = await release('EXPIRE')
    // Offers stay listed until expires_at lapses — poll the home refresh
    // loop until this job's offer is filtered out (~TTL + a few seconds).
    for (let i = 0; i < 30; i++) {
      if (!(await offer(d.m).count())) break
      await ap.waitForTimeout(2000)
      await ap.getByRole('link', { name: 'Jobs', exact: true }).click()
      await ap.getByRole('link', { name: 'Home', exact: true }).click()
    }
    if (await offer(d.m).count()) throw new Error('expired offer still offered to the agent')
    ok('offer expired — no longer offered')
  } catch (e) {
    // Capture the console/agent state before the finally block navigates away.
    await dp.screenshot({ path: 'fail-dispatch-strategies-console.png' }).catch(() => {})
    await ap.screenshot({ path: 'fail-dispatch-strategies-agent.png' }).catch(() => {})
    throw e
  } finally {
    await setStrategy(dp, 'automatic').catch((e) => console.error(`  could not restore automatic strategy: ${e.message}`))
  }
})
