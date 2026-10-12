// Broker-level harness: publish envelopes onto the live `serviq.events`
// exchange so the real consumer containers handle them, then assert on the
// owning service's database. Runs on the compose network (scripts/test.sh).
import amqp from 'amqplib'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

export const uuid = () => randomUUID()
export const DEMO_TENANT = '01ac0000-0000-7000-8000-00000000acde'

// RabbitMQ 4 rejects amqplib's 4 KiB default frame_max (minimum 8 KiB).
const AMQP_URL = process.env.AMQP_URL || 'amqp://serviq:serviq@rabbitmq:5672?frameMax=131072'
let conn
let ch

async function channel() {
  if (!ch) {
    conn = await amqp.connect(AMQP_URL)
    ch = await conn.createConfirmChannel()
  }
  return ch
}

/** Publish a domain-event envelope (EVENT_DELIVERY.MD shape); routing key = type. */
export async function publish(type, tenantId, payload, id = uuid()) {
  const c = await channel()
  const envelope = {
    id, type, occurred_at: new Date().toISOString(), tenant_id: tenantId,
    actor: { service: 'integration-test', on_behalf_of: null }, payload,
  }
  c.publish('serviq.events', type, Buffer.from(JSON.stringify(envelope)), {
    contentType: 'application/json', persistent: true, messageId: id, type,
  })
  await c.waitForConfirms()
  return envelope
}

const pools = {}
export async function q(db, sql, params = []) {
  pools[db] ??= new pg.Pool({
    host: process.env.PGHOST || 'postgres', user: 'serviq',
    password: process.env.PGPASSWORD || 'serviq', database: db, max: 2,
  })
  return (await pools[db].query(sql, params)).rows
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function waitFor(label, fn, { timeout = 30000, interval = 500 } = {}) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
      if (last) return last
    } catch (err) {
      last = err
    }
    await sleep(interval)
  }
  throw new Error(`timed out: ${label}${last instanceof Error ? ` (${last.message})` : ''}`)
}

/** Remove and return the first message on `queue` matching `predicate`; others are requeued. */
export async function takeFromQueue(queue, predicate, timeout = 30000) {
  const c = await channel()
  return waitFor(`message on ${queue}`, async () => {
    const others = []
    let found = null
    for (let m = await c.get(queue); m; m = await c.get(queue)) {
      let body = null
      try { body = JSON.parse(m.content.toString()) } catch { /* not ours */ }
      if (!found && body && predicate(body)) {
        found = body
        c.ack(m)
      } else {
        others.push(m)
      }
    }
    for (const m of others) c.nack(m, false, true)
    return found
  }, { timeout, interval: 1000 })
}

export async function close() {
  await ch?.close()
  await conn?.close()
  await Promise.all(Object.values(pools).map((p) => p.end()))
}

export async function run(name, body) {
  try {
    await body()
    console.log(`\n${name}: PASS`)
  } catch (err) {
    console.error(`\n${name}: FAIL — ${err.message}`)
    process.exitCode = 1
  } finally {
    await close()
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}
