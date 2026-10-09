# Identifiers

This document defines how ServIQ assigns and exposes record identifiers.

## Goals

- Keep identifiers non-predictable when they leave the system boundary.
- Keep database keys efficient and roughly time-ordered.
- Make it clear which identifier belongs in API contracts versus storage internals.

## Identifier Strategy

### UUIDv7 for entity identifiers

Use **UUIDv7** for identifiers that represent domain entities — for example `tenant_id` and `user_id`.

- UUIDv7 is time-ordered, so it stays index-friendly in PostgreSQL while remaining globally unique without coordination.
- These IDs are safe to expose directly in APIs, JWT claims, and events.

### SQID masking for transactional records

Transactional records (invoices, payments, service jobs, refund cases, and similar high-volume rows) keep a sequential **bigint** primary key internally, but must never expose it in requests or responses.

- Public-facing IDs are the bigint encoded as a **SQID** — the same approach YouTube uses for video IDs: short, opaque, non-sequential-looking strings like `Uk8xN2`.
- The bigint↔SQID mapping is reversible inside the service; external callers only ever see the SQID.
- Each service may use its own SQID salt/alphabet so IDs cannot be correlated across services.

```text
Internal          External
bigint 504   ⇄    "xQ8mP2"   (SQID, per-service salt)
```

### Reference numbers are display labels, not record IDs

Human-readable codes like `JOB-1001` or `REQ-10234` may appear in UI and documentation as **reference numbers** —
display labels a user can quote when talking to support. They are not record identifiers:

- API paths, request/response bodies, and event payloads carry the SQID (or UUIDv7 for entities), never the reference number.
- A reference number is a separate generated column, unique per tenant, and is never used to locate or authorize a record in an API contract.
- Spec examples that show `JOB-1001`-style codes are describing what a user sees on screen, not the API contract.

## Rules

- Never expose a predictable sequential ID in a request path, response body, or event payload — enumeration of records must not be possible from IDs alone.
- `created_by`, `updated_by`, and similar accountability fields store the **IAM user ID** (UUIDv7), never a username — usernames are only unique per scope.
- When accepting an external ID in an API call, decode the SQID (or validate the UUID) before touching the datastore; an undecodable ID is a `404`, not a leak of internal state.

## Related Documentation

- [Identity & Access (IAM)](./security/IDENTITY_AND_ACCESS.MD) — user IDs, claims, and accountability
- [Service Stacks](./SERVICE_STACKS.MD) — command/write storage policy
- [Engineering Disciplines](./README.MD)
