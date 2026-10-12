// Customer + Service Agent + Dispatcher lifecycle E2E — one booking driven
// all the way through field work to customer feedback:
//   customer books → dispatcher converts/confirms/releases → auto-assign →
//   agent checks in, runs work steps, captures note/part/photo/payment
//   evidence + customer confirmation, completes → customer tracks the
//   request to Completed and leaves feedback → dispatcher reviews the
//   flagged (duplicate-reference) payment evidence.
import {
  BASE, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  reenter, consoleGo, PNG,
} from './lib/harness.mjs'

const MARK = mark('E2E-LC')
const REF = `REF-${Date.now()}`

await run('LIFECYCLE', async (browser) => {
  const cp = await newPage(browser)
  await login(cp, BASE.customer, 'jane.customer')
  const requestId = await book(cp, MARK)
  ok(`customer booked — ${MARK}`)

  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')
  const jobId = await convertAndRelease(dp, MARK, requestId)
  ok(`job ${jobId} converted, confirmed, released`)
  await waitJobStatus(dp, jobId, /assigned|accepted/)
  ok('job auto-assigned')

  // ── Agent: find this booking by its marker street ─────────────────────
  const ap = await newPage(browser)
  await login(ap, BASE.agent, 'anna.agent')
  const card = ap.locator('a[href*="/jobs/"]', { hasText: MARK })
  await reenter(ap,
    () => ap.getByRole('link', { name: 'Cash turn-in' }).click(),
    () => ap.getByRole('link', { name: /home|jobs/i }).first().click(),
    card)
  await card.first().click()
  await ap.getByRole('button', { name: 'Check in on site' }).click()
  await ap.getByRole('button', { name: 'Complete job' }).waitFor({ timeout: 15000 })
  ok('agent checked in')

  // Work steps (template-dependent — run whatever the service defines).
  for (let i = 0; i < 20; i++) {
    const start = ap.getByRole('button', { name: 'Start', exact: true }).first()
    const close = ap.getByRole('button', { name: 'Close', exact: true }).first()
    if (await close.isVisible().catch(() => false)) await close.click()
    else if (await start.isVisible().catch(() => false)) await start.click()
    else break
    await ap.waitForTimeout(800)
  }
  ok('work steps closed')

  await ap.getByLabel('Add a note').fill(`Field note ${MARK}`)
  await ap.getByRole('button', { name: 'Save note' }).click()
  await ap.getByText(`Field note ${MARK}`).or(ap.locator('.MuiAlert-standardSuccess')).first().waitFor({ timeout: 15000 })
  await ap.getByLabel('Part or material').fill('E2E gasket')
  await ap.getByLabel('Cost (₱)').fill('50')
  await ap.getByRole('button', { name: 'Record part' }).click()
  await ap.waitForTimeout(1000)
  await ap.locator('input[type="file"]').first().setInputFiles(PNG)
  await ap.waitForTimeout(1500)
  ok('note, part, photo captured')

  // Payment evidence twice with one reference — the second trips the
  // duplicate_reference guardrail and lands `flagged` for the dispatcher.
  for (let n = 0; n < 2; n++) {
    await ap.getByLabel('Reference number').fill(REF)
    await ap.getByLabel('Amount (₱)').fill('500')
    await ap.locator('input[type="file"]').nth(1).setInputFiles(PNG)
    await ap.getByText(/Payment evidence (recorded|sent for review)/).first().waitFor({ timeout: 30000 })
  }
  ok('payment evidence submitted (second copy flagged)')

  await ap.getByLabel('Customer name').fill('Jane Customer')
  await ap.getByRole('button', { name: 'Capture confirmation' }).click()
  await ap.waitForTimeout(1500)
  await ap.getByRole('button', { name: 'Complete job' }).click()
  await ap.getByRole('button', { name: 'Complete', exact: true }).click()
  await ap.getByRole('button', { name: 'Complete job' }).waitFor({ state: 'detached', timeout: 20000 })
  ok('agent completed the job')

  // ── Customer: track to Completed, leave feedback ──────────────────────
  const submit = cp.getByRole('button', { name: 'Submit review' })
  const reqLink = cp.locator(`a[href$="/requests/${requestId}"]`).first()
  await reenter(cp,
    () => cp.getByRole('link', { name: 'Home', exact: true }).first().click(),
    () => reqLink.click(),
    submit, { tries: 30 })
  ok('customer sees the request completed')
  await cp.getByLabel('Comment (optional)').fill(`Great work ${MARK}`)
  await submit.click()
  await cp.getByText('Thanks for your feedback!').waitFor({ timeout: 15000 })
  ok('customer feedback submitted')

  // ── Dispatcher: review the flagged evidence ───────────────────────────
  await consoleGo(dp, 'Payment evidence')
  const flagged = dp.locator('tr', { hasText: REF }).filter({ hasText: 'duplicate_reference' })
  await reenter(dp, () => consoleGo(dp, 'Jobs'), () => consoleGo(dp, 'Payment evidence'), flagged)
  await flagged.first().getByRole('button', { name: 'Review' }).click()
  await dp.getByRole('button', { name: 'Accept — record payment' }).click()
  await dp.locator('tr', { hasText: REF }).filter({ hasText: 'duplicate_reference' }).filter({ hasText: /accepted/ }).first().waitFor({ timeout: 15000 })
  ok('dispatcher accepted the flagged evidence')
})
