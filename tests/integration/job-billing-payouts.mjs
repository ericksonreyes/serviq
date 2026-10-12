// Request-to-payout steps 9 + 12 and the refund decision through the broker:
// Assignment.Accepted + Job.Completed → Billing issues the invoice →
// Billing's outbox relays Invoice.Issued → Payouts creates the payout.
// Support.RefundDecided → Billing approves the refund request.
import { assert, publish, q, run, sleep, uuid, waitFor } from './lib/broker.mjs'

await run('JOB → BILLING → PAYOUTS', async () => {
  const tenant = uuid()
  const job = uuid()
  const agent = uuid()
  const customer = uuid()

  await publish('Assignment.Accepted', tenant, { job_id: job, agent_id: agent, assignment_id: uuid(), strategy: 'dispatcher' })
  await waitFor('payouts projects the assignment', async () =>
    (await q('serviq_payouts', 'SELECT agent_id FROM payout_jobs WHERE job_id = $1', [job]))[0]?.agent_id === agent)
  console.log('✓ payouts projected Assignment.Accepted')

  const completed = await publish('Job.Completed', tenant, { job_id: job, agent_id: agent, customer_id: customer })
  const [invoice] = await waitFor('billing issues the invoice', () =>
    q('serviq_billing', 'SELECT id, status, amount_cents FROM invoices WHERE job_id = $1', [job]).then((r) => r.length && r))
  assert(invoice.status === 'issued', `invoice status ${invoice.status}`)
  console.log(`✓ billing issued invoice ${invoice.id} (${invoice.amount_cents} cents)`)

  const [payout] = await waitFor('payouts consumes Invoice.Issued from the billing outbox', () =>
    q('serviq_payouts', 'SELECT id, agent_id, amount_cents, net_cents, status FROM payouts WHERE job_id = $1', [job]).then((r) => r.length && r))
  assert(payout.agent_id === agent && payout.status === 'pending', `payout ${JSON.stringify(payout)}`)
  console.log(`✓ payouts created payout ${payout.id} (gross ${payout.amount_cents}, net ${payout.net_cents})`)

  // At-least-once: the same envelope redelivered, and a second event about the same job.
  await publish('Job.Completed', tenant, { job_id: job, agent_id: agent, customer_id: customer }, completed.id)
  await publish('Job.Completed', tenant, { job_id: job, agent_id: agent, customer_id: customer })
  await sleep(5000)
  const invoices = await q('serviq_billing', 'SELECT id FROM invoices WHERE job_id = $1', [job])
  const payouts = await q('serviq_payouts', 'SELECT id FROM payouts WHERE job_id = $1', [job])
  assert(invoices.length === 1, `${invoices.length} invoices after replay`)
  assert(payouts.length === 1, `${payouts.length} payouts after replay`)
  console.log('✓ replayed Job.Completed — still one invoice and one payout')

  const decision = uuid()
  await publish('Support.RefundDecided', tenant, { invoice_id: invoice.id, decision_id: decision, decided_by: uuid(), reason: 'integration test' })
  const [refund] = await waitFor('billing approves the refund request', () =>
    q('serviq_billing', 'SELECT status, decision_id FROM refund_requests WHERE invoice_id = $1', [invoice.id]).then((r) => r.length && r))
  assert(refund.status === 'approved' && refund.decision_id === decision, `refund ${JSON.stringify(refund)}`)
  console.log('✓ Support.RefundDecided → billing refund request approved')
})
