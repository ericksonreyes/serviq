import express, { NextFunction, Request, Response, Router } from 'express';
import * as jose from 'jose';
import { dataSource } from './db';
import { readDb, CaseDoc } from './readmodel';
import { CaseNote, RefundDecision, SupportCase } from './entities';
import { recordEvent } from './outbox';

interface JwtClaims { sub: string; tenant_id?: string; roles?: string[] }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { jwt?: JwtClaims } }
}

const PLATFORM_SCOPE = 'platform';
let keyResolver: Promise<jose.JWTVerifyGetKey | jose.KeyLike | Uint8Array> | null = null;

// Verify-only: this service never signs tokens (ADR-0001). Resolution order
// mirrors the Laravel services: JWT_PUBLIC_KEY (RS256) → JWKS URL →
// JWT_SECRET (HS256 local/test fallback only).
function getKey() {
  if (!keyResolver) {
    keyResolver = (async () => {
      const pub = process.env.JWT_PUBLIC_KEY;
      if (pub) return jose.importSPKI(pub.replace(/\\n/g, '\n'), 'RS256');
      const jwksUrl = process.env.JWT_JWKS_URL;
      if (jwksUrl) return jose.createRemoteJWKSet(new URL(jwksUrl));
      const secret = process.env.JWT_SECRET;
      if (secret) {
        console.warn('JWT verification resolved to HS256 symmetric fallback (JWT_SECRET). Local/test only.');
        return new TextEncoder().encode(secret);
      }
      throw new Error('No JWT key material configured (JWT_PUBLIC_KEY | JWT_JWKS_URL | JWT_SECRET)');
    })();
  }
  return keyResolver;
}

async function jwtAuth(req: Request, res: Response, next: NextFunction) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const { payload } = await jose.jwtVerify(token, await getKey() as jose.JWTVerifyGetKey, {
      issuer: process.env.JWT_ISSUER || undefined,
      audience: process.env.JWT_AUDIENCE || undefined,
    });
    req.jwt = payload as unknown as JwtClaims;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

// Tenant-scope check for /tenants/:tenant routes — mirrors the Laravel
// RequireTenantScope middleware.
function tenantScope(req: Request, res: Response, next: NextFunction) {
  const tenant = req.params.tenant;
  if (!tenant || req.jwt?.tenant_id === tenant) return next();
  res.status(403).json({ error: 'forbidden', message: 'Token tenant scope does not match the requested tenant' });
}

const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const bad = (res: Response, msg: string) => res.status(422).json({ message: msg, error: 'validation_failed' });

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', (req.headers.origin as string) || '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });


  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'customer-support-backend' });
  });

  const api = Router();
  api.use(jwtAuth);
  // A malformed case id would otherwise reach Postgres as a uuid cast and
  // reject outside Express 4's error path, taking the process down.
  api.param('case', (req, res, next, id) => (uuid(id) ? next() : bad(res, 'case must be a uuid')));

  // ── Read model (plain Express+Node per ADR-0020): case queries. ──
  api.get('/tenants/:tenant/cases', tenantScope, async (req, res) => {
    // Read model is MongoDB, projected off Support.* events (CQRS) —
    // this query never touches the Postgres command store.
    const filter: Record<string, unknown> = { tenant_id: req.params.tenant };
    if (req.query.status) filter.status = req.query.status;
    const docs = await readDb().collection<CaseDoc>('cases')
      .find(filter).sort({ created_at: -1 }).limit(50).toArray();
    res.json({ data: docs.map((d) => ({ ...d, id: d._id })) });
  });

  // Case detail — read-model doc, notes merged from the command side so a
  // just-posted note is never missing behind projection lag.
  api.get('/tenants/:tenant/cases/:case', tenantScope, async (req, res) => {
    const doc = await readDb().collection<CaseDoc>('cases').findOne({ _id: req.params.case });
    const kase = doc ?? await dataSource.getRepository(SupportCase).findOneBy({ id: req.params.case });
    if (!kase || (kase as { tenant_id?: string }).tenant_id !== req.params.tenant) {
      return res.status(404).json({ error: 'not_found' });
    }
    const notes = await dataSource.getRepository(CaseNote)
      .find({ where: { case_id: req.params.case }, order: { created_at: 'ASC' } });
    res.json({ data: { ...kase, id: doc ? doc._id : (kase as SupportCase).id, notes } });
  });

  // Staff note/reply on a case — command write + Support.CaseNoted outbox.
  api.post('/tenants/:tenant/cases/:case/notes', tenantScope, async (req, res) => {
    const { body } = req.body ?? {};
    if (typeof body !== 'string' || !body.trim().length || body.length > 5000) return bad(res, 'body is required (max 5000)');

    const kase = await dataSource.getRepository(SupportCase).findOneBy({ id: req.params.case });
    if (!kase || kase.tenant_id !== req.params.tenant) return res.status(404).json({ error: 'not_found' });
    if (kase.status === 'closed' || kase.status === 'resolved') {
      return res.status(409).json({ error: 'conflict', message: `Case is ${kase.status}` });
    }

    const note = await dataSource.transaction(async (m) => {
      const n = await m.save(CaseNote, m.create(CaseNote, {
        case_id: kase.id, tenant_id: req.params.tenant,
        body: body.trim(), author_id: req.jwt?.sub ?? null,
      }));
      await recordEvent(m, 'Support.CaseNoted', {
        case_id: kase.id, note_id: n.id, body: n.body, author_id: n.author_id,
      }, req.params.tenant);
      return n;
    });
    res.status(201).json({ data: note });
  });

  // Case workflow transitions — open|in_progress|escalated|resolved.
  const CASE_NEXT: Record<string, string[]> = {
    open: ['in_progress', 'escalated', 'resolved'],
    in_progress: ['escalated', 'resolved', 'open'],
    escalated: ['in_progress', 'resolved'],
    investigating: ['in_progress', 'escalated', 'resolved'], // legacy status name
    decided: ['resolved'],
    resolved: [],
    closed: [],
  };
  api.post('/tenants/:tenant/cases/:case/status', tenantScope, async (req, res) => {
    const { status } = req.body ?? {};
    const targets = ['open', 'in_progress', 'escalated', 'resolved'];
    if (typeof status !== 'string' || !targets.includes(status)) {
      return bad(res, `status must be one of ${targets.join('|')}`);
    }

    const kase = await dataSource.getRepository(SupportCase).findOneBy({ id: req.params.case });
    if (!kase || kase.tenant_id !== req.params.tenant) return res.status(404).json({ error: 'not_found' });
    if (!(CASE_NEXT[kase.status] ?? []).includes(status)) {
      return res.status(409).json({ error: 'illegal_transition', message: `Cannot move ${kase.status} → ${status}` });
    }

    const previous = kase.status;
    await dataSource.transaction(async (m) => {
      kase.status = status;
      await m.save(kase);
      await recordEvent(m, 'Support.CaseStatusChanged', {
        case_id: kase.id, status, previous_status: previous, changed_by: req.jwt?.sub ?? null,
      }, req.params.tenant);
    });
    res.json({ data: kase });
  });

  // Refund decisions for support/finance views.
  api.get('/tenants/:tenant/refund-decisions', tenantScope, async (req, res) => {
    const decisions = await dataSource.getRepository(RefundDecision).find({
      where: { tenant_id: req.params.tenant },
      order: { created_at: 'DESC' },
      take: 50,
    });
    res.json({ data: decisions });
  });

  // ── Command side: case intake + refund decisions. ──
  api.post('/cases', async (req, res) => {
    const { subject, job_id, invoice_id, customer_id, details } = req.body ?? {};
    if (typeof subject !== 'string' || !subject.length || subject.length > 255) return bad(res, 'subject is required (max 255)');
    for (const [k, v] of Object.entries({ job_id, invoice_id, customer_id })) {
      if (v !== undefined && v !== null && !uuid(v)) return bad(res, `${k} must be a uuid`);
    }
    const tenantId = req.jwt!.tenant_id ?? PLATFORM_SCOPE;
    const created = await dataSource.transaction(async (m) => {
      const c = await m.save(SupportCase, m.create(SupportCase, {
        subject, job_id: job_id ?? null, invoice_id: invoice_id ?? null,
        customer_id: customer_id ?? null, details: details ?? null,
        tenant_id: tenantId, status: 'open',
      }));
      await recordEvent(m, 'Support.CaseOpened', { case_id: c.id, job_id: c.job_id, invoice_id: c.invoice_id, customer_id: c.customer_id, subject: c.subject, details: c.details }, tenantId);
      return c;
    });
    res.status(201).json({ data: created });
  });

  // ADR-0004: record the decision; emit Support.RefundDecided — Billing executes.
  api.post('/tenants/:tenant/cases/:case/refund-decision', tenantScope, async (req, res) => {
    const { decision, amount_cents, reason } = req.body ?? {};
    if (decision !== 'approved' && decision !== 'denied') return bad(res, 'decision must be approved|denied');
    if (amount_cents !== undefined && (!Number.isInteger(amount_cents) || amount_cents < 1)) return bad(res, 'amount_cents must be a positive integer');
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 1000)) return bad(res, 'reason too long');

    const kase = await dataSource.getRepository(SupportCase).findOneBy({ id: req.params.case });
    if (!kase || kase.tenant_id !== req.params.tenant) return res.status(404).json({ error: 'not_found' });
    if (kase.status === 'closed') return res.status(409).json({ error: 'conflict', message: 'Case is closed' });
    if (!kase.invoice_id && decision === 'approved') return bad(res, 'Case has no invoice');

    const refund = await dataSource.transaction(async (m) => {
      const r = await m.save(RefundDecision, m.create(RefundDecision, {
        case_id: kase.id, invoice_id: kase.invoice_id!, tenant_id: req.params.tenant,
        amount_cents: amount_cents ?? null, decision, reason: reason ?? null,
        decided_by: req.jwt?.sub ?? null,
      }));
      kase.status = 'decided';
      await m.save(kase);
      if (decision === 'approved') {
        await recordEvent(m, 'Support.RefundDecided', {
          decision_id: r.id, case_id: kase.id, invoice_id: kase.invoice_id,
          amount_cents: r.amount_cents, reason: r.reason, decided_by: r.decided_by,
        }, req.params.tenant);
      }
      return r;
    });
    res.status(201).json({ data: refund });
  });

  app.use('/api/v1', api);
  // 404 for anything else under /api
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}
