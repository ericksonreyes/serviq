-- Customer Support schema — mirrors the former Laravel migration 1:1 so the
-- same serviq_support database works for both stacks (ADR-0019).
CREATE TABLE IF NOT EXISTS cases (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    job_id uuid,
    invoice_id uuid,
    customer_id uuid,
    subject varchar(255) NOT NULL,
    status varchar(255) NOT NULL DEFAULT 'open',
    details jsonb,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);
CREATE INDEX IF NOT EXISTS cases_tenant_id_index ON cases (tenant_id);
CREATE INDEX IF NOT EXISTS cases_job_id_index ON cases (job_id);

CREATE TABLE IF NOT EXISTS case_notes (
    id uuid PRIMARY KEY,
    case_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    body text NOT NULL,
    author_id uuid,
    created_at timestamp(0) without time zone
);
CREATE INDEX IF NOT EXISTS case_notes_case_id_index ON case_notes (case_id);
CREATE INDEX IF NOT EXISTS case_notes_tenant_id_index ON case_notes (tenant_id);

CREATE TABLE IF NOT EXISTS refund_decisions (
    id uuid PRIMARY KEY,
    case_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    amount_cents integer,
    decision varchar(255) NOT NULL,
    reason varchar(255),
    decided_by uuid,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);
CREATE INDEX IF NOT EXISTS refund_decisions_case_id_index ON refund_decisions (case_id);
CREATE INDEX IF NOT EXISTS refund_decisions_invoice_id_index ON refund_decisions (invoice_id);

CREATE TABLE IF NOT EXISTS outbox (
    id uuid PRIMARY KEY,
    type varchar(255) NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamp(0) without time zone NOT NULL,
    tenant_id uuid,
    actor_service varchar(255) NOT NULL,
    on_behalf_of uuid,
    published_at timestamp(0) without time zone
);
CREATE INDEX IF NOT EXISTS outbox_published_at_index ON outbox (published_at);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id uuid PRIMARY KEY,
    processed_at timestamp(0) without time zone NOT NULL
);
