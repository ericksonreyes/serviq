// Dispatch ops E2E — dispatcher + tenant-admin surfaces the other scripts
// skip: reschedule a job pre-assignment and reassign it to a second
// eligible agent (created through the roster first), service-area CRUD,
// and agent deactivate/reactivate.
import {
  BASE, run, ok, mark, newPage, login, book, convertToJobDetail, waitJobStatus,
  field, consoleGo, openJob,
} from './lib/harness.mjs'

await run('DISPATCH OPS', async (browser) => {
  const cp = await newPage(browser)
  await login(cp, BASE.customer, 'jane.customer')
  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')

  const MARK = mark('E2E-OPS')

  // ── A second agent on the roster (target for the reassign) ──────────
  await consoleGo(dp, 'Service agents')
  await dp.getByRole('button', { name: 'Add agent', exact: true }).click()
  await field(dp, 'Name').fill(`Agent ${MARK}`)
  await dp.getByRole('button', { name: 'Add agent' }).last().click()
  await dp.locator('tr', { hasText: `Agent ${MARK}` }).first().waitFor({ timeout: 15000 })
  ok(`second agent ${MARK} on the roster`)

  // ── Reschedule (pre-assignment) + reassign a live job ────────────────
  // The job detail hides Reschedule once an agent is assigned — the
  // backend 409s on it — so the window is `requested`/`confirmed`.
  await book(cp, MARK)
  const jobId = await convertToJobDetail(dp, MARK)
  await dp.locator('input[type="datetime-local"]').fill('2026-10-25T10:30')
  await dp.getByRole('button', { name: 'Save', exact: true }).click()
  await dp.getByText('Rescheduled.').waitFor({ timeout: 15000 })
  ok('job rescheduled before assignment')

  await dp.getByRole('button', { name: 'Confirm job' }).click()
  await dp.getByText('Job confirmed.').waitFor({ timeout: 15000 })
  await dp.getByRole('button', { name: 'Mark ready for assignment' }).click()
  await dp.getByText('Released for assignment.').waitFor({ timeout: 15000 })
  await waitJobStatus(dp, jobId, /assigned|accepted/)
  ok(`job ${jobId.slice(0, 8)} auto-assigned`)

  await openJob(dp, jobId)
  await dp.getByRole('button', { name: 'Browse eligible agents' }).click()
  const pick = dp.locator('select', { has: dp.locator('option', { hasText: 'Pick an agent…' }) })
  await pick.locator('option', { hasText: MARK }).first().waitFor({ state: 'attached', timeout: 15000 })
  await pick.selectOption({ label: await pick.locator('option', { hasText: MARK }).first().textContent() })
  await pick.locator('xpath=following-sibling::button').click()
  await dp.getByText('Agent reassigned — the previous agent is notified.').waitFor({ timeout: 15000 })
  ok(`job reassigned to ${MARK}`)

  // ── Service areas — add, rename, remove ──────────────────────────────
  await consoleGo(dp, 'Service areas')
  await dp.getByRole('button', { name: 'Add area', exact: true }).click()
  await field(dp, 'Name').fill(`Area ${MARK}`)
  await field(dp, 'Description').fill('E2E coverage zone')
  await dp.getByPlaceholder(/type places you cover/i).fill('nationwide')
  await dp.getByText(/^nationwide$/i).click()
  await dp.locator('button[type="submit"]', { hasText: 'Add area' }).click()
  await dp.locator('tr', { hasText: `Area ${MARK}` }).first().waitFor({ timeout: 15000 })
  ok('service area added')

  await dp.locator('tr', { hasText: `Area ${MARK}` }).getByRole('button', { name: 'Edit' }).click()
  await field(dp, 'Name').fill(`Area ${MARK} North`)
  await dp.locator('button[type="submit"]', { hasText: 'Save changes' }).click()
  await dp.locator('tr', { hasText: `Area ${MARK} North` }).first().waitFor({ timeout: 15000 })
  ok('service area renamed')

  await dp.locator('tr', { hasText: `Area ${MARK} North` }).getByRole('button', { name: 'Remove' }).click()
  await dp.locator('tr', { hasText: `Area ${MARK}` }).waitFor({ state: 'detached', timeout: 15000 })
  ok('service area removed')

  // ── Deactivate / reactivate the throwaway agent ──────────────────────
  await consoleGo(dp, 'Service agents')
  const agentRow = dp.locator('tr', { hasText: `Agent ${MARK}` })
  await agentRow.getByRole('button', { name: 'Deactivate' }).click()
  await agentRow.filter({ hasText: /inactive/ }).waitFor({ timeout: 15000 })
  ok('agent deactivated')
  await agentRow.getByRole('button', { name: 'Reactivate' }).click()
  await agentRow.getByRole('button', { name: 'Deactivate' }).waitFor({ timeout: 15000 })
  ok('agent reactivated')
})
