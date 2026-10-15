// Chatbots E2E — the three conversational surfaces, driven against the
// AI Agent's deterministic stub mode (AI_VISION_PROVIDER=stub / AI_TEXT_PROVIDER=stub):
//   A) customer ChatWidget — status lookup on a live request, availability,
//      request create, a policy-gated cancel (a real write: the request is
//      cancelled via chat), complaint filing, and a refund request;
//   B) dispatcher CommandBox — agent search, request-queue search, repair
//      guide search, dispatch_recommend on a live job;
//   C) support ChatPanel — case/refund lists (replies carry full ids),
//      a case note + escalation, and refund_process hitting the upstream
//      "pending is not approved" 409 gate — proving routing AND the gate.
// Keyword routing is deterministic in stub mode — assertions match the
// reply text and the tool chip, never model phrasing. Message wording is
// chosen so only the intended keyword rule can fire.
import {
  BASE, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  consoleGo, customerHome,
} from './lib/harness.mjs'

await run('CHATBOTS', async (browser) => {
  // ── A: customer ChatWidget ───────────────────────────────────────────
  const cp = await newPage(browser)
  await login(cp, BASE.customer, 'jane.customer')
  // Harvest a real service id — Home's service cards link to /book/:id.
  await customerHome(cp)
  await cp.getByRole('link', { name: 'Book', exact: true }).first().click()
  await cp.waitForURL(/\/book\//, { timeout: 10000 })
  const serviceId = cp.url().split('/').pop()
  const statusId = await book(cp, mark('E2E-CHAT-STATUS'))
  const cancelId = await book(cp, mark('E2E-CHAT-CANCEL'))
  ok('two requests booked for the chat flow')

  await cp.getByRole('button', { name: 'Open chat' }).click()
  const ask = async (text, expected) => {
    await cp.getByPlaceholder('Ask about a service or booking…').fill(text)
    await cp.getByRole('button', { name: 'Send', exact: true }).click()
    // Reply text also lands in the tool-call summary caption — match the
    // reply paragraph only, or getByText throws on the second hit.
    await cp.locator('p', { hasText: expected }).first().waitFor({ timeout: 45000 })
  }
  await ask(`where is my request ${statusId}`, new RegExp(`${statusId} is currently`))
  ok('chatbot answered the request status')
  await ask(`are there open slots for ${serviceId}`, /Available:|No bookable capacity/)
  ok('chatbot checked service availability')
  await ask(`please book service ${serviceId} for me`, /Service request created/)
  ok('chatbot created a service request')
  await ask(`cancel request ${cancelId}`, new RegExp(`${cancelId} cancelled`))
  ok('chatbot cancelled the request — a real write through chat')
  await ask('I want to file a complaint about the last visit', /Support case filed/)
  ok('chatbot filed a support case')
  await cp.getByRole('button', { name: 'Open chat' }).click() // close the panel

  // ── B: dispatcher CommandBox ─────────────────────────────────────────
  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')
  const m = mark('E2E-CHAT-JOB')
  await book(cp, m)
  const jobId = await convertAndRelease(dp, m)
  await waitJobStatus(dp, jobId, /assigned|accepted/)
  ok('live job for dispatch_recommend')

  await consoleGo(dp, 'Queue & command')
  const command = async (text, tool) => {
    await dp.getByPlaceholder(/Command/).fill(text)
    await dp.getByRole('button', { name: 'Run', exact: true }).click()
    await dp.getByText(tool, { exact: true }).waitFor({ timeout: 45000 })
  }
  await command('find available agents', 'service_agent_search')
  await command('show the request queue', 'service_request_search')
  await command('how do I fix a leaking faucet', 'repair_guide_search')
  await command(`recommend an agent for job ${jobId}`, 'dispatch_recommend')
  ok('dispatcher tools routed and answered')

  // Harvest a real invoice id for the refund_request prompt — the
  // Invoices table renders full ids (unlike the sliced refund/decision ids).
  await consoleGo(dp, 'Refunds & revenue')
  const monoIds = await dp.locator('span.font-mono').allTextContents()
  const invoiceId = monoIds.map((s) => s.trim()).find((s) => /^[0-9a-f-]{36}$/i.test(s)) || null

  // ── C: customer refund_request — leaves a pending refund for the
  //       support panel to act on below ────────────────────────────────
  await cp.getByRole('button', { name: 'Open chat' }).click()
  if (invoiceId) {
    await ask(`I want a refund for invoice ${invoiceId}`, /Refund request submitted/)
  } else {
    await ask('I want a refund for my invoice', /Which invoice should the refund cover/)
  }
  ok('customer chatbot: refund_request routed')

  // ── D: support ChatPanel — lists, case writes, refund gate ───────────
  await consoleGo(dp, 'Cases')
  await dp.getByRole('button', { name: 'Support assistant' }).click()
  const tell = async (text, tool) => {
    // Tool tags persist in old bubbles — wait for the reply COUNT to grow,
    // then assert the new (last) bubble carries this call's tool.
    const bubbles = dp.locator('div.fixed.bottom-5 div.bg-slate-100')
    const before = await bubbles.count()
    await dp.getByPlaceholder('Message…').fill(text)
    await dp.getByRole('button', { name: 'Send', exact: true }).click()
    for (let i = 0; i < 90 && (await bubbles.count()) <= before; i++) await dp.waitForTimeout(500)
    const last = bubbles.last()
    if (!((await last.textContent().catch(() => '')) || '').includes(tool)) {
      await last.locator('span.font-mono', { hasText: tool }).waitFor({ timeout: 45000 })
    }
    return (await last.textContent()) || ''
  }
  const caseList = await tell('list open cases', 'complaint_manage')
  // Listing rows render "<case id> [status] <subject>" — pick out the
  // complaint this script filed in section A.
  const caseId = caseList.match(/([0-9a-f-]{36}) \[[^\]]*\] I want to file a complaint/i)?.[1] || null
  const refundList = await tell('list pending refunds', 'refund_manage')
  // Only a pending row is refused at execute — an approved one succeeds.
  const refundId = refundList.match(/([0-9a-f-]{36}) \[pending/i)?.[1] || null
  ok('support tools routed and answered')

  if (caseId) {
    await tell(`add a note to case ${caseId}: e2e chat note`, 'complaint_manage')
    const escalated = await tell(`escalate case ${caseId}`, 'complaint_manage')
    if (!escalated.includes(`moved to 'escalated'`)) throw new Error(`escalation reply unexpected: ${escalated}`)
    const resolved = await tell(`resolve case ${caseId}`, 'complaint_manage')
    if (!resolved.includes(`moved to 'resolved'`)) throw new Error(`resolve reply unexpected: ${resolved}`)
    ok('support chatbot: case note + escalation + resolve landed')
  } else {
    ok('support chatbot: no filed case found in list — write tools skipped')
  }

  // Executing a *pending* refund must be refused by Billing — the chat
  // surfaces the upstream 409 as a state-gate reply, not a crash.
  if (refundId) {
    const refused = await tell(`process refund ${refundId}`, 'refund_process')
    if (!/isn't allowed in the record's current state/.test(refused)) {
      throw new Error(`expected the pending-refund gate, got: ${refused}`)
    }
    ok('support chatbot: refund_process on pending refused by upstream gate')
  }
})
