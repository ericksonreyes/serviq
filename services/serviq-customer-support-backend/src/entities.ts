import { randomBytes } from 'crypto';
import {
  Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn,
} from 'typeorm';

// UUIDv7 per ADR-0006 — time-ordered, generated in-process (no dep needed).
export function uuid7(): string {
  const now = Date.now();
  const bytes = randomBytes(10);
  const hex = [
    now.toString(16).padStart(12, '0'),
    ((bytes[0] & 0x0f) | 0x70).toString(16).padStart(2, '0') + bytes.readUInt8(1).toString(16).padStart(2, '0'),
    ((bytes[2] & 0x3f) | 0x80).toString(16).padStart(2, '0') + bytes.readUInt8(3).toString(16).padStart(2, '0'),
    bytes.subarray(4).toString('hex'),
  ];
  return `${hex[0].slice(0, 8)}-${hex[0].slice(8)}-${hex[1]}-${hex[2]}-${hex[3]}`;
}

@Entity('cases')
export class SupportCase {
  @PrimaryColumn('uuid') id = uuid7();
  @Column('uuid') tenant_id!: string;
  @Column('uuid', { nullable: true }) job_id!: string | null;
  @Column('uuid', { nullable: true }) invoice_id!: string | null;
  @Column('uuid', { nullable: true }) customer_id!: string | null;
  @Column('varchar') subject!: string;
  @Column('varchar', { default: 'open' }) status = 'open'; // open|investigating|decided|closed
  @Column('jsonb', { nullable: true }) details!: unknown;
  @CreateDateColumn() created_at!: Date;
  @UpdateDateColumn() updated_at!: Date;
}

// ADR-0004: Support DECIDES refunds, Billing EXECUTES them.
@Entity('refund_decisions')
export class RefundDecision {
  @PrimaryColumn('uuid') id = uuid7();
  @Column('uuid') case_id!: string;
  @Column('uuid') invoice_id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('int', { nullable: true }) amount_cents!: number | null; // null = full
  @Column('varchar') decision!: string; // approved|denied
  @Column('varchar', { nullable: true }) reason!: string | null;
  @Column('uuid', { nullable: true }) decided_by!: string | null;
  @CreateDateColumn() created_at!: Date;
  @UpdateDateColumn() updated_at!: Date;
}

@Entity('outbox')
export class OutboxEvent {
  @PrimaryColumn('uuid') id = uuid7();
  @Column('varchar') type!: string;
  @Column('jsonb') payload!: unknown;
  @Column('timestamp') occurred_at!: Date;
  @Column('uuid', { nullable: true }) tenant_id!: string | null;
  @Column('varchar') actor_service!: string;
  @Column('uuid', { nullable: true }) on_behalf_of!: string | null;
  @Column('timestamp', { nullable: true }) published_at!: Date | null;
}

@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn('uuid') event_id!: string;
  @Column('timestamp') processed_at!: Date;
}
