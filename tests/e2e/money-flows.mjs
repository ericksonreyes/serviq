// Money flows E2E — the remittance/payout paths the cash suite doesn't:
//   A) agent photographs an e-wallet receipt on a completed job → AI parse
//      (advisory) → dispatcher accepts the flagged evidence → invoice paid →
//      dispatcher remits the validated digital payment;
//   B) short cash turn-in → dispatcher "Accept shortfall";
//   C) short cash turn-in → dispatcher "Override";
//   D) tenant admin settles a pending agent payout;
//   E) support denies a refund — Billing never approves it.
import {
  BASE, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  reenter, consoleGo, peso, completeJob, collectCash, openTurnIn, turnIn, reviewRemittance,
} from './lib/harness.mjs'

await run('MONEY FLOWS', async (browser) => {
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

  // ── A: e-wallet proof → evidence review → digital remittance ──────────
  await completeJob(ap, await release('EW'))
  const due = ap.getByText(/Amount due:/)
  await due.waitFor({ timeout: 45000 })
  const amount = peso(await due.textContent())
  const ref = String(Date.now())
  await ap.getByLabel('Reference number').fill(ref)
  await ap.getByLabel('Amount (₱)', { exact: true }).fill(String(amount))
  await ap.getByLabel('Channel').fill('GCash')
  const chooser = ap.waitForEvent('filechooser')
  await ap.getByRole('button', { name: 'Photograph receipt & submit' }).click()
  await (await chooser).setFiles({
    name: 'gcash.png', mimeType: 'image/png',
    buffer: Buffer.from(`e_wallet_receipt provider: GCash amount: ${amount} reference_no: ${ref}`),
  })
  const notice = ap.getByText(/Payment evidence (recorded|sent for review)/)
  await notice.waitFor({ timeout: 30000 })
  ok(`agent submitted e-wallet proof ${ref} (${(await notice.textContent()).trim()})`)

  // The stub parser reports low confidence, so the dispatcher decides.
  await consoleGo(dp, 'Payment evidence')
  const evRow = dp.locator('tr', { hasText: ref })
  await reenter(dp, () => consoleGo(dp, 'Jobs'), () => consoleGo(dp, 'Payment evidence'), evRow)
  if (await evRow.first().getByRole('button', { name: 'Review' }).isVisible().catch(() => false)) {
    await evRow.first().getByRole('button', { name: 'Review' }).click()
    await dp.getByRole('button', { name: 'Accept — record payment' }).click()
  }
  await evRow.filter({ hasText: /accepted/ }).first().waitFor({ timeout: 15000 })
  ok('dispatcher accepted the e-wallet evidence — invoice paid digitally')

  await consoleGo(dp, 'Remittances')
  // Remittances is a task hub — the bulk-remit form lives on its own page.
  await dp.getByRole('link', { name: /Digital payments/ }).click()
  const digital = dp.getByRole('button', { name: /^Mark \d* ?as remitted$/ })
  await digital.waitFor({ timeout: 15000 })
  for (const box of await dp.locator('li input[type="checkbox"]').all()) await box.check()
  await digital.click()
  await dp.getByText('No validated digital payments awaiting remittance.').waitFor({ timeout: 15000 })
  ok('dispatcher remitted the validated digital payment')

  // ── B/C: short cash turn-ins resolved two ways ─────────────────────────
  for (const [tag, action] of [['SHORT', 'Accept shortfall'], ['OVR', 'Override']]) {
    await completeJob(ap, await release(tag))
    await collectCash(ap)
    const expected = peso(await openTurnIn(ap))
    await turnIn(ap, Math.max(0, expected - 50))
    ok(`agent turned in ₱50 short of ₱${expected}`)
    await reviewRemittance(dp, 'turn in', action)
    ok(`dispatcher resolved the short turn-in with "${action}"`)
  }

  // ── D: payout settlement ───────────────────────────────────────────────
  await consoleGo(dp, 'Revenue & payouts')
  await dp.getByRole('button', { name: 'Payouts', exact: true }).click()
  const pending = dp.locator('tr').filter({ has: dp.getByRole('button', { name: 'Settle' }) })
  await pending.first().waitFor({ timeout: 15000 })
  const payoutId = (await pending.first().locator('td span.font-mono').first().textContent()).replace('…', '').trim()
  await pending.first().getByRole('button', { name: 'Settle' }).click()
  await dp.locator('tr', { hasText: payoutId }).filter({ hasText: /settled/i }).first().waitFor({ timeout: 15000 })
  ok(`tenant admin settled payout ${payoutId}`)

  // ── E: refund denied ───────────────────────────────────────────────────
  const MARK = mark('E2E-DENY')
  await dp.getByRole('button', { name: /^invoices/i }).first().click()
  const invoiceCell = dp.locator('tr', { hasText: /issued|paid|remitted/ }).locator('td span.font-mono').first()
  await invoiceCell.waitFor({ timeout: 15000 })
  const invoiceId = (await invoiceCell.textContent()).trim()
  await consoleGo(dp, 'Cases')
  await dp.getByRole('button', { name: 'New case' }).click()
  await dp.getByLabel('Subject').fill(`Refund ask ${MARK}`)
  await dp.getByLabel('Invoice id (optional)').fill(invoiceId)
  await dp.getByLabel('Details').fill('Customer wants money back; work was done as quoted.')
  await dp.getByRole('button', { name: 'Open case' }).click()
  const row = dp.locator('button', { hasText: `Refund ask ${MARK}` })
  await reenter(dp, () => consoleGo(dp, 'Refunds & revenue'), () => consoleGo(dp, 'Cases'), row)
  await row.first().click()
  await dp.locator('select').filter({ has: dp.locator('option[value="denied"]') }).selectOption('denied')
  await dp.getByPlaceholder('Reason').fill(`Denied ${MARK}`)
  await dp.getByRole('button', { name: 'Record decision' }).click()
  await dp.getByText('Refund decision recorded — Billing executes approved refunds.').waitFor({ timeout: 15000 })
  ok('support denied the refund')
  await dp.waitForTimeout(4000)
  await consoleGo(dp, 'Refunds & revenue')
  await dp.getByText('Refunds & revenue').first().waitFor()
  if (await dp.locator('tr', { hasText: `Denied ${MARK}` }).count()) throw new Error('denied refund reached Billing')
  ok('billing created no refund for the denied decision')
})
