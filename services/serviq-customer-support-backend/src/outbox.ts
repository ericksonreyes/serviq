import { IsNull, EntityManager } from 'typeorm';
import * as amqp from 'amqplib';
import { dataSource } from './db';
import { OutboxEvent } from './entities';

const exchange = () => process.env.RABBITMQ_EXCHANGE || 'serviq.events';
const serviceName = () => process.env.APP_NAME || 'customer-support-backend';

// Same transactional outbox contract as the Laravel services: domain writes
// and the outbox row commit atomically; the relay publishes + stamps later.
export async function recordEvent(
  manager: EntityManager,
  type: string,
  payload: unknown,
  tenantId: string | null,
  onBehalfOf?: string | null,
): Promise<void> {
  await manager.save(OutboxEvent, manager.create(OutboxEvent, {
    type,
    payload,
    occurred_at: new Date(),
    tenant_id: tenantId,
    actor_service: serviceName(),
    on_behalf_of: onBehalfOf ?? null,
  }));
}

export class OutboxRelay {
  private readonly log = console;

  // Polls unpublished outbox rows → serviq.events topic exchange → stamps
  // published_at. Runs in the -consumer container (ADR-0011).
  async run(): Promise<never> {
    const conn = await amqp.connect(`amqp://${process.env.RABBITMQ_USER || 'serviq'}:${process.env.RABBITMQ_PASSWORD || 'serviq'}@${process.env.RABBITMQ_HOST || 'rabbitmq'}:${process.env.RABBITMQ_PORT || 5672}`);
    const ch = await conn.createChannel();
    await ch.assertExchange(exchange(), 'topic', { durable: true });
    this.log.log(`Outbox relay started — publishing to ${exchange()}`);

    const repo = dataSource.getRepository(OutboxEvent);
    for (;;) {
      const pending = await repo.find({
        where: { published_at: IsNull() },
        order: { occurred_at: 'ASC' },
        take: 100,
      });
      for (const ev of pending) {
        try {
          ch.publish(exchange(), ev.type, Buffer.from(JSON.stringify({
            id: ev.id,
            type: ev.type,
            occurred_at: ev.occurred_at.toISOString(),
            tenant_id: ev.tenant_id,
            actor: { service: ev.actor_service, on_behalf_of: ev.on_behalf_of },
            payload: ev.payload,
          })), { persistent: true });
          ev.published_at = new Date();
          await repo.save(ev);
        } catch (e) {
          this.log.error(`Failed to publish ${ev.id}: ${(e as Error).message}`);
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
