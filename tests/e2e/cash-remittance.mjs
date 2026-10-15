// Cash remittance E2E — both ways an agent remits cash collected on a job:
//   A) agent records "Collected cash" → hands cash to the dispatcher via the
//      turn-in count → dispatcher confirms;
//   B) agent records "Collected cash" → deposits over the counter and uploads
//      the remittance-center receipt (AI Agent reads amount + reference) →
//      Billing validates the deposit batch → dispatcher confirms.
import {
  BASE, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  select, peso, completeJob, collectCash, openTurnIn, turnIn, reviewRemittance,
} from './lib/harness.mjs'

async function completeAndCollect(ap, marker) {
  await completeJob(ap, marker)
  await collectCash(ap)
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
    await book(cp, m)
    const jobId = await convertAndRelease(dp, m)
    await waitJobStatus(dp, jobId, /assigned|accepted/)
    return m
  }

  // ── A: hand-over turn-in ──────────────────────────────────────────────
  await completeAndCollect(ap, await release('CASH'))
  ok('agent completed the job and recorded cash collected')
  const expected = await openTurnIn(ap)
  await turnIn(ap, peso(expected))
  ok(`agent turned in ${expected}`)
  await reviewRemittance(dp, 'turn in')
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
  await reviewRemittance(dp, 'deposit batch')
  ok('dispatcher confirmed the deposit')
})
