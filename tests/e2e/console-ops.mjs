// Console ops E2E — surfaces the persona scripts don't reach:
//   A) dispatcher reviews a request's customer location in the queue;
//   B) tenant admin edits business settings beyond the dispatch strategy
//      (operating hours, cancellation policy — operational flags untouched:
//      auto_broadcast would change dispatch behaviour for other scripts);
//   C) support walks a case through its status transitions via the console.
import {
  BASE, run, ok, mark, newPage, login, book, field, consoleGo, reenter,
} from './lib/harness.mjs'

await run('CONSOLE OPS', async (browser) => {
  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')

  // ── A: dispatcher sees the customer location on a queued request ─────
  const cp = await newPage(browser)
  await login(cp, BASE.customer, 'jane.customer')
  const m = mark('E2E-LOC')
  await book(cp, m)
  await consoleGo(dp, 'Service requests')
  // The request list is a read model — re-enter until the row projects.
  const reqRow = dp.locator('button', { hasText: m }).first()
  await reenter(dp, () => consoleGo(dp, 'Jobs'), () => consoleGo(dp, 'Service requests'), reqRow)
  await reqRow.click()
  await dp.locator('dd', { hasText: /E2E City/ }).waitFor({ timeout: 15000 })
  ok('dispatcher sees the customer location on the request')

  // ── B: business settings — hours + cancellation policy ───────────────
  await consoleGo(dp, 'Business settings')
  await field(dp, 'Operating hours').fill(`E2E hours ${m}`)
  await field(dp, 'Cancellation policy').fill(`E2E policy ${m}`)
  await dp.getByRole('button', { name: 'Save settings' }).click()
  await dp.getByText('Settings saved.').waitFor({ timeout: 15000 })
  ok('business settings saved')

  // ── C: case status transitions via the console ───────────────────────
  await consoleGo(dp, 'Cases')
  await dp.getByRole('button', { name: 'New case' }).click()
  await dp.getByLabel('Subject').fill(`Status walk ${m}`)
  await dp.getByLabel('Details').fill('E2E transition check.')
  await dp.getByRole('button', { name: 'Open case' }).click()
  await dp.getByText(`Case "Status walk ${m}" opened.`).waitFor({ timeout: 15000 })
  // The case list is a read model — re-enter until the row projects.
  const row = dp.locator('button', { hasText: `Status walk ${m}` })
  await reenter(dp, () => consoleGo(dp, 'Refunds & revenue'), () => consoleGo(dp, 'Cases'), row)
  await row.first().click()
  for (const s of ['in progress', 'escalated', 'resolved']) {
    await dp.getByRole('button', { name: s, exact: true }).click()
    await dp.getByText(`Case marked ${s}.`).waitFor({ timeout: 15000 })
  }
  ok('case walked open → in progress → escalated → resolved')
})
