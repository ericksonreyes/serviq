// Consumer guarantees through the real broker: duplicate deliveries are
// handled once, a handler that throws dead-letters the message (not lost),
// and Identity.InvitationCreated produces notification rows.
import { DEMO_TENANT, assert, publish, q, run, sleep, takeFromQueue, uuid, waitFor } from './lib/broker.mjs'

await run('IDEMPOTENCY + DLQ', async () => {
  const tenant = uuid()
  const agent = uuid()
  const remittance = uuid()
  const shortfall = { remittance_id: remittance, agent_id: agent, shortage_cents: 25000 }

  const first = await publish('Remittance.ShortfallAccepted', tenant, shortfall)
  const [row] = await waitFor('payouts records the shortfall deduction', () =>
    q('serviq_payouts', "SELECT status, shortfall_cents FROM payouts WHERE disbursement_ref = $1", [`remit:${remittance}`]).then((r) => r.length && r))
  assert(row.status === 'deduction' && row.shortfall_cents === 25000, `deduction ${JSON.stringify(row)}`)
  console.log('✓ Remittance.ShortfallAccepted → deduction on the agent ledger')

  await publish('Remittance.ShortfallAccepted', tenant, shortfall, first.id)
  await publish('Remittance.ShortfallAccepted', tenant, shortfall)
  await sleep(5000)
  const rows = await q('serviq_payouts', 'SELECT id FROM payouts WHERE disbursement_ref = $1', [`remit:${remittance}`])
  assert(rows.length === 1, `${rows.length} deductions after replay`)
  const seen = await q('serviq_payouts', 'SELECT event_id FROM processed_events WHERE event_id = $1', [first.id])
  assert(seen.length === 1, 'event id not recorded in processed_events')
  console.log('✓ duplicate delivery and replayed shortfall deduct once')

  const poison = await publish('Support.RefundDecided', tenant, { invoice_id: uuid(), decision_id: uuid() })
  await takeFromQueue('billing.events.dlq', (b) => b.id === poison.id)
  const done = await q('serviq_billing', 'SELECT event_id FROM processed_events WHERE event_id = $1', [poison.id])
  assert(done.length === 0, 'failed event was marked processed')
  console.log('✓ handler failure (refund for unknown invoice) dead-lettered to billing.events.dlq')

  const invitation = uuid()
  const invite = await publish('Identity.InvitationCreated', DEMO_TENANT, {
    invitation_id: invitation, email: `integration+${invitation.slice(0, 8)}@example.test`,
    role: 'Service Agent', tenant_slug: 'acme', token: 'integration-test',
    accept_url: 'http://localhost:3002/invite/integration-test', invited_by: null,
  })
  const notes = await waitFor('notification rows for the invitation', () =>
    q('serviq_notifications', "SELECT channel FROM notifications WHERE context->>'invitation_id' = $1", [invitation]).then((r) => r.length && r))
  const channels = notes.map((n) => n.channel).sort()
  const [email] = await q('serviq_notifications', "SELECT enabled FROM tenant_channels WHERE tenant_id = $1 AND channel = 'email'", [DEMO_TENANT])
  if (email?.enabled) assert(channels.includes('email'), `email enabled but channels = ${channels}`)
  await publish('Identity.InvitationCreated', DEMO_TENANT, invite.payload, invite.id)
  await sleep(4000)
  const after = await q('serviq_notifications', "SELECT id FROM notifications WHERE context->>'invitation_id' = $1", [invitation])
  assert(after.length === notes.length, `${after.length} rows after replay (was ${notes.length})`)
  console.log(`✓ Identity.InvitationCreated → notifications on [${channels}], replay deduped`)
})
