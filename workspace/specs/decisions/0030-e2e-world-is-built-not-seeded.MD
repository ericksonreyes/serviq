# ADR-0030: The E2E world is built through real flows, not seeded

- Status: Accepted
- Date: 2026-10-15

## Context

The browser E2E suite ran against whatever the dev database happened to
contain — the `Demo*Seeders` create `acme` and its accounts at container
start, so every suite silently depended on fixture state it never
constructed. Two consequences: suites couldn't start from a known-empty
world, and **the onboarding chain itself — provider signup → platform
activation → tenant configuration → agent invite/accept → customer
signup — was exercised by no test**, despite being the product's first
user journey and the same order the stage map documents.

## Decision

`./scripts/e2e.sh --fresh` runs the suite against an empty,
platform-only database:

- **Isolated cluster.** `docker-compose.e2e.yml` adds `postgres-e2e`
  (own volume, same init scripts so the `serviq_app` RLS role exists).
  Every backend and consumer is repointed via `DB_HOST`; the dev
  `infra-postgres` is physically untouchable. Reset is a blunt volume
  removal, not `DROP` against a shared cluster.
- **`SEED_DEMO=false`.** Each `DatabaseSeeder` gates its demo calls on
  the env (default true — dev unchanged). Canonical seeds stay:
  IAM permission catalog + platform admin, subscription plans, feature
  flags, location hierarchy, notification templates.
- **`bootstrap.mjs` builds the world through the real UI** — console
  `/signup` (provider self-signup rides `Platform.TenantCreated`'s
  `initial_users` through IAM's consumer), platform admin activates,
  `acme.admin` configures catalog/areas/roster + invites the agent,
  the agent accepts at her portal, the customer signs up at hers.
  Every step is create-if-absent with the real end state as the probe,
  so the suite is idempotent and doubles as a world validator.
- **One documented API exception:** company accounts (transfer-rail
  recipients) are read-only in the console UI — no create form exists —
  so bootstrap POSTs them with the admin JWT. Adding the settings UI is
  a feature task, not a test task.

Why UI over API for everything else: the bootstrap IS the persona stage
map — running it through real pages means a broken onboarding UI fails
at the exact stage that broke, and the suite documents the product's
actual provisioning path rather than a parallel API shortcut.

## Consequences

- The 16 existing suites run unchanged — bootstrap recreates the same
  identities the seeders produced (`acme`, `acme.admin`, `anna.agent`,
  `jane.customer`, `demo-pass-123`).
- `SEED_DEMO` gating is the contract separating canonical seeds from
  demo fixtures; new demo seeders must respect it.
- A fresh run costs the provisioning waits (~1–2 min for the
  TenantCreated → IAM consumer hop); that wait is itself the test.
- Screenshot captures against a fresh world produce deterministic doc
  data instead of accumulated dev artifacts.
