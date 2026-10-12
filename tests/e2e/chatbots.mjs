// Chatbots E2E — the three conversational surfaces, driven against the
// AI Agent's deterministic stub mode (AI_MODEL_MODE=stub):
//   A) customer ChatWidget — status lookup on a live request, a policy-
//      gated cancel (a real write: the request is cancelled via chat),
//      and complaint filing;
//   B) dispatcher CommandBox — agent search, request-queue search, repair
//      guide search, dispatch_recommend on a live job;
//   C) support ChatPanel — case list, refund list.
// Keyword routing is deterministic in stub mode — assertions match the
// reply text and the tool chip, never model phrasing. Message wording is
// chosen so only the intended keyword rule can fire.
import {
  BASE, run, ok, mark, newPage, login, book, convertAndRelease, waitJobStatus,
  consoleGo,
} from './lib/harness.mjs'

await run('CHATBOTS', async (browser) => {
  // ── A: customer ChatWidget ───────────────────────────────────────────
  const cp = await newPage(browser)
  await login(cp, BASE.customer, 'jane.customer')
  const statusId = await book(cp, mark('E2E-CHAT-STATUS'))
  const cancelId = await book(cp, mark('E2E-CHAT-CANCEL'))
  ok('two requests booked for the chat flow')

  await cp.getByRole('button', { name: 'Open chat' }).click()
  const ask = async (text, expected) => {
    await cp.getByPlaceholder('Ask about a service or booking…').fill(text)
    await cp.getByRole('button', { name: 'Send', exact: true }).click()
    await cp.getByText(expected).waitFor({ timeout: 45000 })
  }
  await ask(`where is my request ${statusId}`, new RegExp(`${statusId} is currently`))
  ok('chatbot answered the request status')
  await ask(`cancel request ${cancelId}`, new RegExp(`${cancelId} cancelled`))
  ok('chatbot cancelled the request — a real write through chat')
  await ask('I want to file a complaint about the last visit', /Support case filed/)
  ok('chatbot filed a support case')
  await cp.getByRole('button', { name: 'Open chat' }).click() // close the panel

  // ── B: dispatcher CommandBox ─────────────────────────────────────────
  const dp = await newPage(browser)
  await login(dp, BASE.console, 'acme.admin')
  const m = mark('E2E-CHAT-JOB')
  const jobId = await convertAndRelease(dp, m, await book(cp, m))
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

  // ── C: support ChatPanel ─────────────────────────────────────────────
  await consoleGo(dp, 'Cases')
  await dp.getByRole('button', { name: 'Support assistant' }).click()
  const tell = async (text, tool) => {
    await dp.getByPlaceholder('Message…').fill(text)
    await dp.getByRole('button', { name: 'Send', exact: true }).click()
    await dp.getByText(tool, { exact: true }).waitFor({ timeout: 45000 })
  }
  await tell('list open cases', 'complaint_manage')
  await tell('list pending refunds', 'refund_manage')
  ok('support tools routed and answered')
})
