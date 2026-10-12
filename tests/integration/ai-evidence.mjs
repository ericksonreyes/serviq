// AI evidence consumer through the broker:
// - happy path: photo in MinIO + Execution.EvidenceCaptured → ai-agent parses
//   → AI.PaymentProofParsed (observed via the notification consumer, which
//   binds every routing key and stores the payload as context);
// - failure path: an object that can't be fetched dead-letters to
//   ai-agent.events.dlq instead of vanishing.
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { DEMO_TENANT, assert, publish, q, run, takeFromQueue, uuid, waitFor } from './lib/broker.mjs'

const BUCKET = 'serviq-evidence'
const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000', region: 'us-east-1', forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER || 'serviq',
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'serviq-local',
  },
})

await run('AI EVIDENCE', async () => {
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET })).catch(() => {})
  const evidence = uuid()
  const ref = `BD-${Date.now()}`
  const key = `integration/${evidence}.jpg`
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, ContentType: 'image/jpeg',
    Body: `bank_deposit_slip bank: IT-Bank amount: 1500.00 reference_no: ${ref} date: 2026-10-11`,
  }))
  await publish('Execution.EvidenceCaptured', DEMO_TENANT, {
    job_id: uuid(), evidence_id: evidence, kind: 'photo', object_ref: `${BUCKET}/${key}`,
  })
  const [row] = await waitFor('AI.PaymentProofParsed for the evidence', () =>
    q('serviq_notifications', "SELECT context FROM notifications WHERE event_type = 'AI.PaymentProofParsed' AND context->>'evidence_id' = $1", [evidence])
      .then((r) => r.length && r))
  const parsed = row.context
  assert(parsed.document_type === 'bank_deposit_slip', `document_type ${parsed.document_type}`)
  assert(parsed.fields?.reference_no?.toLowerCase() === ref.toLowerCase(), `reference ${JSON.stringify(parsed.fields)}`)
  console.log(`✓ evidence parsed → AI.PaymentProofParsed (${parsed.document_type}, ref ${parsed.fields.reference_no}, amount ${parsed.fields.amount})`)

  const evt = await publish('Execution.EvidenceCaptured', uuid(), {
    job_id: uuid(), evidence_id: uuid(), kind: 'photo', object_ref: `${BUCKET}/missing-${uuid()}.jpg`,
  })
  await takeFromQueue('ai-agent.events.dlq', (b) => b.id === evt.id, 20000)
  console.log('✓ unfetchable evidence dead-lettered to ai-agent.events.dlq')
})
