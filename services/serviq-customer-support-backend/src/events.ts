import * as amqp from 'amqplib';
import { dataSource } from './db';
import { ProcessedEvent } from './entities';
import { readDb, CaseDoc } from './readmodel';

const exchange = () => process.env.RABBITMQ_EXCHANGE || 'serviq.events';
const queue = () => process.env.RABBITMQ_QUEUE || 'customer-support.events';
const bindings = () => (process.env.RABBITMQ_BINDINGS || 'Support.*').split(',').map((b) => b.trim());

interface Envelope {
  id: string;
  type: string;
  tenant_id?: string | null;
  occurred_at?: string;
  payload: Record<string, unknown>;
}

// Idempotent consumer on the serviq.events topic exchange with the standard
// DLQ topology (EVENT_DELIVERY.MD). Projects Support.* into the MongoDB read
// model; other bound types only warm the dedupe table.
export class EventsConsumer {
  private readonly log = console;

  async run(): Promise<never> {
    const conn = await amqp.connect(`amqp://${process.env.RABBITMQ_USER || 'serviq'}:${process.env.RABBITMQ_PASSWORD || 'serviq'}@${process.env.RABBITMQ_HOST || 'rabbitmq'}:${process.env.RABBITMQ_PORT || 5672}`);
    const ch = await conn.createChannel();
    await ch.assertExchange(exchange(), 'topic', { durable: true });

    const dlx = `${exchange()}.dlx`;
    const dlq = `${queue()}.dlq`;
    await ch.assertExchange(dlx, 'direct', { durable: true });
    await ch.assertQueue(dlq, { durable: true });
    await ch.bindQueue(dlq, dlx, dlq);
    await ch.assertQueue(queue(), { durable: true, deadLetterExchange: dlx, deadLetterRoutingKey: dlq });
    for (const b of bindings()) await ch.bindQueue(queue(), exchange(), b);
    this.log.log(`Consuming ${queue()} bound to ${bindings().join(', ')}`);

    const dedupe = dataSource.getRepository(ProcessedEvent);
    const cases = readDb().collection<CaseDoc>('cases');

    await ch.consume(queue(), async (msg) => {
      if (!msg) return;
      try {
        const env = JSON.parse(msg.content.toString()) as Envelope;
        // Insert-first dedupe: a duplicate delivery is a PK violation → skip.
        const res = await dedupe.createQueryBuilder()
          .insert().into(ProcessedEvent).values({ event_id: env.id, processed_at: new Date() })
          .orIgnore().returning('event_id').execute();
        if (res.identifiers.length === 0) { ch.ack(msg); return; }

        if (env.type === 'Support.CaseOpened') {
          await cases.updateOne({ _id: env.payload.case_id as string }, {
            $set: {
              tenant_id: (env.tenant_id ?? '') as string,
              job_id: (env.payload.job_id as string) ?? null,
              invoice_id: (env.payload.invoice_id as string) ?? null,
              customer_id: (env.payload.customer_id as string) ?? null,
              subject: env.payload.subject as string,
              status: 'open',
              details: env.payload.details ?? null,
              updated_at: new Date(),
            },
            $setOnInsert: {
              created_at: new Date(env.occurred_at ?? Date.now()),
            },
          }, { upsert: true });
        } else if (env.type === 'Support.CaseNoted') {
          await cases.updateOne({ _id: env.payload.case_id as string }, {
            $push: {
              notes: {
                id: env.payload.note_id as string,
                body: env.payload.body as string,
                author_id: (env.payload.author_id as string) ?? null,
                created_at: new Date(env.occurred_at ?? Date.now()),
              },
            },
            $set: { updated_at: new Date() },
          });
        } else if (env.type === 'Support.CaseStatusChanged') {
          await cases.updateOne({ _id: env.payload.case_id as string }, {
            $set: {
              status: env.payload.status as string,
              updated_at: new Date(),
            },
          });
        } else if (env.type === 'Support.RefundDecided') {
          await cases.updateOne({ _id: env.payload.case_id as string }, {
            $set: {
              status: 'decided',
              refund: {
                decision: 'approved',
                amount_cents: (env.payload.amount_cents as number) ?? null,
                reason: (env.payload.reason as string) ?? null,
                decided_by: (env.payload.decided_by as string) ?? null,
              },
              updated_at: new Date(),
            },
          });
        }

        this.log.log(`processed ${env.type} ${env.id}`);
        ch.ack(msg);
      } catch (e) {
        this.log.error(`handler failed: ${(e as Error).message} — dead-lettering`);
        ch.nack(msg, false, false);
      }
    }, { noAck: false });

    return new Promise(() => undefined);
  }
}
