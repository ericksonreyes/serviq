// Transfer remittance E2E — the external-rail turn-ins (ADR-0026/27) the
// cash suite doesn't reach:
//   A) agent: "Remitted via transfer" → e-wallet rail → receipt naming the
//      company's GCash → lands manual_review + wallet_transfer → dispatcher
//      opens the stored Receipt (blob popup proves the MinIO artifact
//      streams back through the file endpoint) → Confirm settles it;
//   B) dispatcher: Agent turn-in → bank rail → inline slip upload parses on
//      select (AI-read fields fill, no typing) → "turn in · bank" +
//      bank_transfer → Confirm;
//   C) dispatcher: wallet rail → receipt naming the WRONG recipient →
//      recipient_mismatch surfaces on the record, plain Confirm is refused
//      ("explicit override or reject"), Reject with a note settles the
//      audit trail and releases the collections (expected total returns).
//
// Provider-agnostic: in stub mode the fake slips carry `key: value` text
// the stub regex-extracts and the AI-read assertions run; a real provider
// can't read these buffers, so fields stay empty — the suite then types
// the values like a human dispatcher (claimed_mismatch is expected and
// asserted). C's recipient flag fires either way: stub parses the wrong
// recipient into `extracted`, manual entry lands it in `claimed` — both
// feed the account check.
import {
  BASE, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  select, peso, completeJob, collectCash, openTurnIn, consoleGo, reenter,
} from './lib/harness.mjs'

// Fake receipt image — the stub vision reads text embedded in the bytes.
// Single-token values only (the stub regex captures [0-9A-Za-z.-]+).
const slip = (doc, fields) => ({
  name: `${doc}.png`, mimeType: 'image/png',
  buffer: Buffer.from(`${doc} ` + Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(' ')),
})

// Remittance-record row matching kind/channel text and any flag text.
const remRow = (dp, kind, flag) =>
  dp.locator('tr', { hasText: kind }).filter(flag ? { hasText: flag } : {})

// Wait until `row` shows `status` (its Review buttons vanish on settlement).
async function waitStatus(row, status) {
  await row.filter({ hasText: new RegExp(status) }).first().waitFor({ timeout: 15000 })
}

await run('TRANSFER REMITTANCE', async (browser) => {
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
  const completeAndCollect = async (marker) => { await completeJob(ap, marker); await collectCash(ap) }

  // Dispatcher turn-in form, in two steps: pick Anna + rail (returns the
  // held total so the caller can build a matching slip), then attach the
  // receipt and submit — parse-on-select must fill the AI-read fields.
  async function openDispatcherTurnIn(channel) {
    await consoleGo(dp, 'Agent turn-in')
    await dp.locator('select').first().selectOption({ label: 'Anna Agent' })
    const box = dp.getByText(/Expected to turn in:/)
    await box.waitFor({ timeout: 15000 })
    const expected = peso(await box.textContent())
    await dp.locator('select').nth(1).selectOption(channel)
    return expected
  }
  // Attach a receipt and submit. The field block renders once the parse
  // resolves OR fails — if the AI filled nothing (non-stub provider can't
  // read the fake slip), the dispatcher types the values like a human
  // would; Billing then flags claimed_mismatch, which is itself asserted.
  async function attachAndSubmit(file, manual) {
    await dp.locator('input[type="file"][accept="image/*"]').setInputFiles(file)
    const refInput = dp.locator('input[placeholder="Reference no."]')
    await refInput.waitFor({ timeout: 60000 })
    const aiRead = await dp.getByText('Reference no. (AI-read)').isVisible().catch(() => false)
      && (await refInput.inputValue()) !== ''
    if (!aiRead && manual) {
      await refInput.fill(manual.ref)
      await dp.locator('input[placeholder="Amount sent (₱)"]').fill(String(manual.amount))
      await dp.locator('input[placeholder="Recipient name or account no."]').fill(manual.recipient)
    }
    const refVal = await refInput.inputValue()
    await dp.getByRole('button', { name: /Submit (e-wallet|bank deposit|remittance center) turn-in/ }).click()
    await dp.getByText(/turn-in submitted — it stays in manual review/).waitFor({ timeout: 15000 })
    return { ref: refVal, aiRead }
  }

  // ── A: agent wallet turn-in, correct recipient ────────────────────────
  await completeAndCollect(await release('WALLET'))
  const expectedA = peso(await openTurnIn(ap))
  const refA = `EW-${Date.now()}`
  await select(ap, 'How did you send it?', 'E-wallet transfer (GCash/Maya)')
  await ap.getByLabel('Transfer receipt').setInputFiles(slip('e_wallet_receipt', {
    provider: 'GCash', amount: expectedA, reference_no: refA,
    recipient_name: 'ServIQ-Acme', recipient_account: '09171234567',
  }))
  await ap.getByRole('button', { name: 'Submit e-wallet turn-in' }).click()
  await ap.getByRole('button', { name: 'Submit', exact: true }).click()
  const notice = ap.getByText(/Wallet turn-in submitted/)
  await notice.waitFor({ timeout: 30000 })
  const noticeText = await notice.textContent()
  if (!noticeText.includes('manual_review') || !noticeText.includes('wallet_transfer'))
    throw new Error(`wallet turn-in did not land in manual review: ${noticeText}`)
  ok(`agent remitted ${expectedA} via e-wallet — manual_review, wallet_transfer`)

  // Dispatcher: the stored receipt streams back, then a clean confirm.
  await consoleGo(dp, 'Jobs')
  await consoleGo(dp, 'Remittances')
  const walletRow = remRow(dp, 'turn in · wallet', 'wallet_transfer')
  await walletRow.first().waitFor({ timeout: 15000 })
  const [receipt] = await Promise.all([
    dp.context().waitForEvent('page', { timeout: 15000 }),
    walletRow.first().getByRole('button', { name: 'Receipt' }).click(),
  ])
  if (!receipt.url().startsWith('blob:')) throw new Error(`receipt opened ${receipt.url()}, not a stored artifact`)
  await receipt.close()
  ok('dispatcher opened the stored receipt — MinIO artifact streamed back')
  await walletRow.first().getByRole('button', { name: 'Confirm', exact: true }).click()
  await waitStatus(remRow(dp, 'turn in · wallet', 'wallet_transfer'), 'remitted')
  ok('dispatcher confirmed the wallet turn-in after verifying arrival')

  // ── B: dispatcher-side bank turn-in, inline parse ─────────────────────
  await completeAndCollect(await release('BANK'))
  await openTurnIn(ap)
  const expectedB = await openDispatcherTurnIn('bank')
  const refB = `BD-${Date.now()}`
  const bankOut = await attachAndSubmit(slip('bank_deposit_slip', {
    bank: 'BDO', recipient_name: 'ServIQ-Acme', recipient_account: '001234567890',
    amount: expectedB, reference_no: refB, deposit_date: '2026-10-20',
  }), { ref: refB, amount: expectedB, recipient: '001234567890' })
  if (bankOut.aiRead && bankOut.ref.toLowerCase() !== refB.toLowerCase()) throw new Error(`AI read ${bankOut.ref}, slip says ${refB}`)
  ok(bankOut.aiRead
    ? `dispatcher submitted a bank turn-in — AI parsed ref ${bankOut.ref}, ₱${expectedB}`
    : 'AI could not read the fake slip — dispatcher typed the values (claimed_mismatch expected)')

  await consoleGo(dp, 'Jobs')
  await consoleGo(dp, 'Remittances')
  const bankRow = remRow(dp, 'turn in · bank', 'bank_transfer')
  await bankRow.first().waitFor({ timeout: 15000 })
  if (await bankRow.first().getByText(/recipient_mismatch/).isVisible().catch(() => false))
    throw new Error('correct-recipient slip flagged recipient_mismatch — the guardrail false-positives')
  // Stub parse → clean manual_review (Confirm). Manual entry → claimed_mismatch
  // (typed values the AI couldn't verify) → needs Override. Either is correct.
  const bankFlagged = await bankRow.first().getByText(/claimed_mismatch/).isVisible().catch(() => false)
  await bankRow.first().getByRole('button', { name: bankFlagged ? 'Override' : 'Confirm', exact: true }).click()
  await waitStatus(remRow(dp, 'turn in · bank', 'bank_transfer'), 'remitted')
  ok(`dispatcher settled the bank turn-in via ${bankFlagged ? 'Override' : 'Confirm'}`)

  // ── C: wrong recipient → flag → confirm refused → reject releases ──────
  await completeAndCollect(await release('MISMATCH'))
  const expectedC = await openDispatcherTurnIn('wallet')
  const refC = `BAD-${Date.now()}`
  await attachAndSubmit(slip('e_wallet_receipt', {
    provider: 'GCash', amount: expectedC, reference_no: refC,
    recipient_name: 'Someone-Else', recipient_account: '09999999999',
  }), { ref: refC, amount: expectedC, recipient: '09999999999' })
  ok('dispatcher submitted a wallet turn-in naming the wrong recipient')

  await consoleGo(dp, 'Jobs')
  await consoleGo(dp, 'Remittances')
  const badRow = remRow(dp, 'turn in · wallet', 'recipient_mismatch')
  await badRow.first().waitFor({ timeout: 15000 })
  ok('recipient_mismatch surfaced on the remittance record')

  await badRow.first().getByRole('button', { name: 'Confirm', exact: true }).click()
  await dp.getByText(/explicit override or reject/).waitFor({ timeout: 15000 })
  ok('plain Confirm refused on a flagged record — an explicit decision is required')

  await badRow.first().getByPlaceholder('Note (optional)').fill('Receipt names a stranger — re-collect from agent')
  await badRow.first().getByRole('button', { name: 'Reject', exact: true }).click()
  await waitStatus(remRow(dp, 'turn in · wallet', 'recipient_mismatch'), 'rejected')
  ok('dispatcher rejected the suspect turn-in — Remittance.Rejected records who/why')

  // Rejection released the collections — the turn-in page owes them again.
  await consoleGo(dp, 'Agent turn-in')
  await dp.locator('select').first().selectOption({ label: 'Anna Agent' })
  await reenter(dp,
    () => consoleGo(dp, 'Jobs'),
    () => consoleGo(dp, 'Agent turn-in').then(() => dp.locator('select').first().selectOption({ label: 'Anna Agent' })),
    dp.getByText(/Expected to turn in: ₱[1-9]/))
  ok("rejected turn-in released the collections — Anna owes them again")
})
