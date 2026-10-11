import amqplib from 'amqplib'
import { MongoClient } from 'mongodb'

const RABBIT = process.env.RABBITMQ_URL || 'amqp://serviq:serviq@rabbitmq:5672'
const MONGO = process.env.MONGODB_URI || 'mongodb://mongo:27017/serviq_portal'
const EXCHANGE = 'serviq.events'
const QUEUE = 'customer-portal-bff.events'
const BINDINGS = ['Request.*', 'Job.*', 'Assignment.*']

// CQRS read side: fold domain events into portal-shaped documents.
async function apply(db, env) {
  const { type, payload: p = {}, tenant_id } = env
  const jobs = db.collection('portal_jobs')
  const requests = db.collection('portal_requests')
  if (type === 'Request.Submitted') {
    await requests.updateOne({ _id: p.request_id }, {
      $set: {
        tenant_id,
        customer_id: p.customer_id,
        service_id: p.service_id,
        preferred_date: p.preferred_date ?? null,
        scheduled_for: p.scheduled_for ?? null,
        address_id: p.address_id ?? null,
        details: p.details ?? null,
        status: 'submitted',
        occurred_at: env.occurred_at,
      },
    }, { upsert: true })
  }
  if (type === 'Request.Cancelled' && p.request_id) {
    await requests.updateOne({ _id: p.request_id }, { $set: { status: 'cancelled' } })
  }
  if (type === 'Request.FeedbackSubmitted' && p.request_id) {
    await requests.updateOne({ _id: p.request_id }, { $set: { feedback_rating: p.rating } })
  }
  if (type === 'Request.Converted' && p.request_id) {
    await requests.updateOne({ _id: p.request_id }, { $set: { status: 'converted', job_id: p.job_id } })
  }
  if (type.startsWith('Job.') && p.job_id) {
    const statusMap = {
      'Job.Requested': 'requested', 'Job.Confirmed': 'confirmed',
      'Job.ReadyForAssignment': 'finding_agent', 'Job.Assigned': 'assigned',
      'Job.Accepted': 'en_route', 'Job.Started': 'in_progress',
      'Job.Completed': 'completed', 'Job.Cancelled': 'cancelled',
    }
    if (statusMap[type]) {
      await jobs.updateOne({ _id: p.job_id }, {
        $set: { tenant_id, status: statusMap[type], agent_id: p.agent_id ?? null, updated_at: env.occurred_at },
      }, { upsert: true })
    }
    if (type === 'Job.Requested' && p.request_id) {
      await jobs.updateOne({ _id: p.job_id }, {
        $set: {
          request_id: p.request_id,
          customer_id: p.customer_id ?? null,
          service_id: p.service_id ?? null,
          scheduled_for: p.details?.scheduled_for ?? p.scheduled_for ?? null,
        },
      })
      await requests.updateOne({ _id: p.request_id }, { $set: { job_id: p.job_id, status: 'converted' } })
    }
    if (type === 'Job.Cancelled' && p.request_id) {
      await requests.updateOne({ _id: p.request_id }, { $set: { status: 'cancelled' } })
    }
  }
  if (type === 'Assignment.Accepted' && p.job_id) {
    await jobs.updateOne({ _id: p.job_id }, { $set: { agent_id: p.agent_id, status: 'assigned' } })
  }
}

export async function startProjector() {
  const mongo = new MongoClient(MONGO)
  await mongo.connect()
  const db = mongo.db()
  const conn = await amqplib.connect(RABBIT)
  const ch = await conn.createChannel()
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true })
  await ch.assertQueue(QUEUE, { durable: true })
  for (const key of BINDINGS) await ch.bindQueue(QUEUE, EXCHANGE, key)
  console.log(`[bff] projecting ${QUEUE}`)
  ch.consume(QUEUE, async (msg) => {
    try {
      await apply(db, JSON.parse(msg.content.toString()))
      ch.ack(msg)
    } catch (e) {
      console.error('[bff] project error', e.message)
      ch.nack(msg, false, false)
    }
  })
  return { mongo, conn }
}
