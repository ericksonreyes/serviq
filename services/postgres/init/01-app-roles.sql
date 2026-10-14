-- Non-privileged application role (ADR-0028).
--
-- `serviq` (POSTGRES_USER) is a cluster superuser — Postgres row-level
-- security never binds superusers, so services that opt into RLS (billing)
-- connect as `serviq_app` for the policies to hold. Membership in `serviq`
-- inherits every table privilege (incl. DDL on serviq-owned objects for
-- migrations), while `current_user` stays serviq_app so tenant_isolation
-- policies apply. Trusted console processes bypass via the app.is_system
-- GUC — see TenantContext::asSystem().
--
-- Runs on first initdb only (docker-entrypoint-initdb.d). For existing
-- volumes, apply once by hand:
--   docker exec infra-postgres psql -U serviq -d serviq -f /docker-entrypoint-initdb.d/01-app-roles.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'serviq_app') THEN
    CREATE ROLE serviq_app LOGIN PASSWORD 'serviq' IN ROLE serviq;
  END IF;
END $$;
