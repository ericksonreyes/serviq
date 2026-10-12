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

// Compose postgres only provisions the shared "serviq" database — create
// this service's database on first boot, mirroring the PHP entrypoints.
async function ensureDatabase(): Promise<void> {
  const name = process.env.DB_DATABASE || 'serviq_support';
  const admin = new Client({
    host: process.env.DB_HOST || 'postgres',
    port: Number(process.env.DB_PORT || 5432),
    database: 'postgres',
    user: process.env.DB_USERNAME || 'serviq',
    password: process.env.DB_PASSWORD || 'serviq',
  });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } catch (e) {
    if ((e as { code?: string }).code !== '42P04') throw e;
  } finally {
    await admin.end();
  }
}

export async function ensureSchema(): Promise<void> {
  await ensureDatabase();
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
