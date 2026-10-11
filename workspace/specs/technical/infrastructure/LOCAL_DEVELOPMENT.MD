# Local Development

Operational detail for running the ServIQ stack locally. Install and bring-up are handled by [`scripts/install.sh`](../../../../scripts/install.sh); this document explains how the stack is wired and how to work in it day to day. Before installing, check the measured [Minimum Requirements](./LOCAL_RESOURCE_BUDGET.MD#minimum-requirements-measured-2026-10-11) — the full stack with live AI needs ~5 GiB of Docker VM memory and ~20 GB of disk on an 8 GB host.

## The dev stack

`services/docker-compose.yml` is developer mode, not production: every service's
source dir is bind-mounted into its container — including `vendor/` and
`node_modules` once installed — so the deps live on your host filesystem
(IDE-indexable) and code changes are live with zero rebuilds:

- **Laravel** — mod_php re-reads per request, instant reload
- **BFFs** — `node --watch`
- **ai-agent** — `uvicorn --reload`
- **Frontends** — `vite dev` hot-reload servers on 3000–3003 are the only
  frontend shape (`install.sh` brings them up via `--profile dev`; they're
  also in the `full` profile so it still means "the whole stack"). There is
  no production-shape nginx build in this repo — that's a deployment
  concern, not a local-dev concern.

`install.sh` installs each backend's `vendor/` onto the host first (via a
one-off `composer:2` container — the Laravel runtime images ship no composer
binary); Node services self-install `node_modules` on boot. To add a dep
later, `exec` into the running container:
`docker compose -f services/docker-compose.yml exec service-agent-bff npm install <pkg>`.

**Never run host-native npm/composer/pip inside a service dir** — the deps
are Linux binaries for the containers; the IDE indexes them fine either way.

## Local seed accounts

Demo accounts for immediate testing — **local development only, never use
these credentials elsewhere.** The credential table and tenant ID live in
the [root README](../../../../README.MD#local-seed-accounts); this section
documents how the seeding works.

Seeding happens automatically inside the service containers on start: the
shared Laravel entrypoint runs `php artisan db:seed --force` (idempotent)
after migrations.

- **Platform Administrator** — `identity-access-backend`'s `DatabaseSeeder`
  creates the IAM permission catalog and the platform `admin` account.
- **Demo tenant + users** — `platform-management-backend`'s `DemoTenantSeeder`
  creates the "Acme Services" tenant (`slug: acme`, starts `active`) and emits
  the real `Platform.TenantCreated` event with `initial_users`, so IAM's
  consumer provisions the scope and accounts through the normal onboarding
  pipeline — no cross-service database writes.
- **Demo business data** — the tenant ID is a **fixed UUID**, so each
  context's own seeder can write tenant-scoped rows without a cross-DB lookup:
  - `service-management` `DemoCatalogSeeder` — 3 catalog services (Aircon
    Cleaning ₱1,500, Plumbing Repair ₱2,500, Home Deep Cleaning ₱3,500)
    with 3 workflow steps each, covering Antipolo/Cainta
  - `workforce-management` `DemoAgentSeeder` — agent "Anna Agent" (mirrors
    `anna.agent`; `user_id` left unlinked), all three skills, weekday
    08:00–17:00 availability
  - `customer-request-management` `DemoCustomerSeeder` — CRM row
    "Jane Customer" (mirrors `jane.customer`)

Re-seed manually if needed:

```bash
docker compose -f services/docker-compose.yml exec \
  platform-management-backend php artisan db:seed --force
```

(swap the service name to re-seed that context's demo data). Auth routes are
throttled at 5 req/min — rapid login attempts will hit 429s.

## Related Documentation

- [Infrastructure & Local Development](./README.MD)
- [Local Resource Budget](./LOCAL_RESOURCE_BUDGET.MD)
- [Compose File Conventions (ADR 0016)](../../decisions/0016-compose-file-conventions.MD)
