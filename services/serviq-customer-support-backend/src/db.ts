import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { OutboxEvent, ProcessedEvent, RefundDecision, SupportCase, CaseNote } from './entities';

export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE || 'serviq_support',
  username: process.env.DB_USERNAME || 'serviq',
  password: process.env.DB_PASSWORD || 'serviq',
  entities: [SupportCase, RefundDecision, CaseNote, OutboxEvent, ProcessedEvent],
  // Schema is applied by ensureSchema() from src/schema.sql (idempotent,
  // mirrors the former Laravel migration). synchronize stays off — the
  // entity columns match that DDL 1:1.
  synchronize: false,
});

export async function ensureSchema(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST || 'postgres',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_DATABASE || 'serviq_support',
    user: process.env.DB_USERNAME || 'serviq',
    password: process.env.DB_PASSWORD || 'serviq',
  });
  await client.connect();
  await client.query(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
  await client.end();
}
