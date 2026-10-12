// Cash remittance E2E — both ways an agent remits cash collected on a job:
//   A) agent records "Collected cash" → hands cash to the dispatcher via the
//      turn-in count → dispatcher confirms;
//   B) agent records "Collected cash" → deposits over the counter and uploads
//      the remittance-center receipt (AI Agent reads amount + reference) →
//      Billing validates the deposit batch → dispatcher confirms.
import {
  BASE, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  reenter, consoleGo, select,
} from './lib/harness.mjs'

const peso = (text) => Number(String(text).replace(/[^0-9.]/g, ''))

async function completeAndCollect(ap, marker) {
  const card = ap.locator('a[href*="/jobs/"]', { hasText: marker })
  await reenter(ap,
    () => ap.getByRole('link', { name: 'Cash turn-in' }).click(),
    () => ap.getByRole('link', { name: 'Home' }).click(),
    card.first())
  await card.first().click()
  await ap.getByRole('button', { name: 'Check in on site' }).click()
  await ap.getByRole('button', { name: 'Complete job' }).waitFor({ timeout: 15000 })
  for (let i = 0; i < 20; i++) {
    const start = ap.getByRole('button', { name: 'Start', exact: true }).first()
    const close = ap.getByRole('button', { name: 'Close', exact: true }).first()
    if (await close.isVisible().catch(() => false)) await close.click()
    else if (await start.isVisible().catch(() => false)) await start.click()
    else break
    await ap.waitForTimeout(800)
  }
  await ap.getByRole('button', { name: 'Complete job' }).click()
  await ap.getByRole('button', { name: 'Complete', exact: true }).click()
  // Billing issues the invoice on Job.Completed; the page polls for it.
  await ap.getByRole('button', { name: 'Collected cash' }).click({ timeout: 45000 })
  await ap.getByRole('button', { name: 'Record cash' }).click()
  await ap.getByText('Cash collection recorded').waitFor({ timeout: 15000 })
  await ap.getByText('Invoice Paid.').waitFor({ timeout: 15000 })
}

async function openTurnIn(ap) {
  await ap.getByRole('link', { name: 'Home' }).click()
  await ap.getByRole('link', { name: 'Cash turn-in' }).click()
  const total = ap.getByText('Expected total').locator('xpath=following-sibling::*[1]')
  await total.waitFor({ timeout: 15000 })
  return (await total.textContent()).trim()
}

async function confirmPending(dp, kind) {
  await consoleGo(dp, 'Jobs')
  await consoleGo(dp, 'Remittances')
  const rows = dp.locator('tr', { hasText: kind }).filter({ has: dp.getByRole('button', { name: 'Confirm', exact: true }) })
  await rows.first().waitFor({ timeout: 15000 })
  const before = await rows.count()
  await rows.first().getByRole('button', { name: 'Confirm', exact: true }).click()
  for (let i = 0; i < 20 && (await rows.count()) >= before; i++) await dp.waitForTimeout(500)
  if ((await rows.count()) >= before) throw new Error(`${kind} remittance was not confirmed`)
}

await run('CASH REMITTANCE', async (browser) => {
  const cp = await newPage(browser)
  await login(cp, BASE.customer, 'jane.customer')
  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')
  const ap = await newPage(browser)
  await login(ap, BASE.agent, 'anna.agent')

  const release = async (tag) => {
    const m = mark(`E2E-${tag}`)
    const jobId = await convertAndRelease(dp, m, await book(cp, m))
    await waitJobStatus(dp, jobId, /assigned|accepted/)
    return m
  }

  // ── A: hand-over turn-in ──────────────────────────────────────────────
  await completeAndCollect(ap, await release('CASH'))
  ok('agent completed the job and recorded cash collected')
  const expected = await openTurnIn(ap)
  await ap.getByLabel('Counted cash on hand (₱)').fill(String(peso(expected)))
  await ap.getByRole('button', { name: 'Submit turn-in' }).click()
  await ap.getByRole('button', { name: 'Submit', exact: true }).click()
  await ap.getByText(/Turn-in submitted/).waitFor({ timeout: 15000 })
  ok(`agent turned in ${expected}`)
  await confirmPending(dp, 'turn in')
  ok('dispatcher confirmed the turn-in')

  // ── B: over-the-counter deposit with an uploaded receipt ──────────────
  await completeAndCollect(ap, await release('DEP'))
  ok('second job completed and cash recorded')
  const covered = await openTurnIn(ap)
  const ref = `RC-${Date.now()}`
  await select(ap, 'Proof of deposit', 'Remittance-center receipt')
  await ap.getByLabel('Slip photo').setInputFiles({
    name: 'remittance-receipt.png', mimeType: 'image/png',
    buffer: Buffer.from(`remittance_receipt provider: E2E-Remit amount: ${peso(covered)} reference_no: ${ref} date: 2026-10-11`),
  })
  await ap.getByRole('button', { name: 'Submit deposit' }).click()
  await ap.getByRole('button', { name: 'Submit', exact: true }).click()
  const alert = ap.getByText(/Deposit submitted/)
  await alert.waitFor({ timeout: 20000 })
  const text = await alert.textContent()
  if (!text.includes('pending_confirmation')) throw new Error(`deposit not clean: ${text}`)
  ok(`agent deposited ${covered} — receipt ${ref} parsed and validated`)
  await confirmPending(dp, 'deposit batch')
  ok('dispatcher confirmed the deposit')
})
