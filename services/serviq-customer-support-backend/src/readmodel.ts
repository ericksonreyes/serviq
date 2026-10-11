import { MongoClient, Db } from 'mongodb';

// CQRS read model (ADR-0020): cases projected into MongoDB from Support.*
// events by the consumer — same pattern as the portal BFF projector.
export interface CaseNoteDoc {
  id: string;
  body: string;
  author_id: string | null;
  created_at: Date;
}

export interface CaseDoc {
  _id: string;
  tenant_id: string;
  job_id: string | null;
  invoice_id: string | null;
  customer_id: string | null;
  subject: string;
  status: string;
  details: unknown;
  notes?: CaseNoteDoc[];
  refund?: { decision: string; amount_cents: number | null; reason: string | null; decided_by: string | null };
  created_at: Date;
  updated_at: Date;
}

let db: Db | null = null;

export async function connectReadModel(): Promise<Db> {
  if (db) return db;
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://mongo:27017/serviq_support');
  await client.connect();
  db = client.db();
  await db.collection<CaseDoc>('cases').createIndex({ tenant_id: 1, created_at: -1 });
  return db;
}

export function readDb(): Db {
  if (!db) throw new Error('read model not connected');
  return db;
}
