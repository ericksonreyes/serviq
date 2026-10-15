-- Per-service databases — created at cluster initdb so every backend's
-- first boot finds its database already present.
--
-- Why this exists: service entrypoints also self-create their DB (a
-- one-shot `CREATE DATABASE` before the migrate-retry loop), but that
-- fires once — if the cluster is still initializing, or the runtime role
-- lacks CREATEDB (billing's serviq_app, intentionally), the database
-- never appears and the service starts broken. Centralizing creation at
-- initdb removes both races for any fresh cluster — dev and postgres-e2e.
--
-- Plain statements, not a DO block: CREATE DATABASE cannot run inside a
-- function/transaction. Idempotency is free — docker-entrypoint-initdb.d
-- only executes on a fresh cluster (empty PGDATA).
CREATE DATABASE serviq_identity OWNER serviq;
CREATE DATABASE serviq_platform OWNER serviq;
CREATE DATABASE serviq_service OWNER serviq;
CREATE DATABASE serviq_request OWNER serviq;
CREATE DATABASE serviq_job OWNER serviq;
CREATE DATABASE serviq_workforce OWNER serviq;
CREATE DATABASE serviq_dispatch OWNER serviq;
CREATE DATABASE serviq_field OWNER serviq;
CREATE DATABASE serviq_support OWNER serviq;
CREATE DATABASE serviq_notification OWNER serviq;
CREATE DATABASE serviq_billing OWNER serviq;
CREATE DATABASE serviq_payouts OWNER serviq;
