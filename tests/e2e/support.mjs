// Support — open a case against an issued invoice, post a note, approve a
// refund, then verify Billing's refund state from the console.
import { BASE, run, ok, mark, newPage, login, consoleGo, reenter } from './lib/harness.mjs'

const MARK = mark('E2E-CS')

await run('SUPPORT', async (browser) => {
  const p = await newPage(browser)
  await login(p, BASE.console, 'acme.admin')
  ok('support agent logged in')

  // An invoice to dispute — any issued invoice (the lifecycle E2E makes one).
  await consoleGo(p, 'Revenue & payouts')
  const tab = p.getByRole('button', { name: /^invoices/i })
  if (await tab.count()) await tab.first().click()
  const invoiceCell = p.locator('tr', { hasText: /issued|paid/ }).locator('td span.font-mono').first()
  await invoiceCell.waitFor({ timeout: 15000 })
  const invoiceId = (await invoiceCell.textContent()).trim()
  ok(`disputing invoice ${invoiceId.slice(0, 8)}`)

  await consoleGo(p, 'Cases')
  await p.getByRole('button', { name: 'New case' }).click()
  await p.getByLabel('Subject').fill(`Overcharged ${MARK}`)
  await p.getByLabel('Invoice id (optional)').fill(invoiceId)
  await p.getByLabel('Details').fill('Customer reports a double charge.')
  await p.getByRole('button', { name: 'Open case' }).click()
  // The intake form unmounts on success — the durable signal is the
  // reloaded case row (a read model projected off Support.CaseOpened).
  const row = p.locator('button', { hasText: `Overcharged ${MARK}` })
  await reenter(p, () => consoleGo(p, 'Refunds & revenue'), () => consoleGo(p, 'Cases'), row)
  ok('case opened')
  await row.first().click()
  await p.getByPlaceholder('Write a reply or internal note…').fill(`Checked ledger ${MARK}`)
  await p.getByRole('button', { name: 'Post' }).click()
  await p.getByText('Note added.').waitFor({ timeout: 15000 })
  ok('note added')

  await p.getByPlaceholder('Amount (PHP)').fill('1')
  await p.getByPlaceholder('Reason').fill(`Refund ${MARK}`)
  await p.getByRole('button', { name: 'Record decision' }).click()
  await p.getByText('Refund decision recorded — Billing executes approved refunds.').waitFor({ timeout: 15000 })
  ok('refund approved')

  // Billing consumes Support.RefundDecided → an approved refund request.
  await consoleGo(p, 'Refunds & revenue')
  const refund = p.locator('tr', { hasText: `Refund ${MARK}` }).filter({ hasText: /approved|refunded|executed/ })
  await reenter(p, () => consoleGo(p, 'Cases'), () => consoleGo(p, 'Refunds & revenue'), refund)
  ok('billing shows the refund approved')
})
