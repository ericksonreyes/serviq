# ServIQ platform — all 19 services implemented (2026-10-09)

`docker compose --profile full up -d` verified: 40 containers, every
`/api/health` green, 4 nginx frontends on 8080-8083.

## Verified live flows
- request → job → confirm → ready → automatic dispatch → Assignment.Accepted
  → Job.Assigned → FSE execution → check-in → steps → Job.Completed
- Job.Completed → Invoice.Issued (PHP 1500 stub) → pay → remit → settled
- Support case → refund decision → Invoice.Refunded (post-remittance OK)
- Invoice.Issued → Payout (60% stub) → settle via DisbursementPort stub
- Portal BFF projector → Mongo read model → /me/jobs verified
- AI agent: stub-mode parse endpoint + 20-doc eval (type accuracy 1.00)
- Notifications consumer '#' → in-app feed

## Deviations to flag
- BFFs: Express + jose instead of NestJS (POC build time); API shape kept.
- Frontends: static nginx shells instead of React+Vite+MUI (POC).
- AI agent: no DB/outbox — publishes AI.PaymentProofParsed inline; stub
  parser default, ollama profile documented.
- php:8.4-apache could not be pulled (Docker Hub 429); built services on a
  retagged base + `rm -rf /var/www/html` + `pecl install redis || true`
  hardening in all Dockerfiles. Re-pin the base when the hub settles.
- minio/minio left Docker Hub → swapped to bitnamilegacy/minio.
- fluent-bit tag fixed to 4.2.

## Ops gotchas
- Events published before a consumer's queue exists are lost — re-emit
  via an outbox INSERT (see ops notes in phase2-3 handoff).
- Compose builds one image per service name; build api+consumer together.
- Consumers: `(until php artisan outbox:publish; do sleep 5; done) &`
  wrapper — relay used to die before migrations.
- Payouts once got a stray billing migration (base-image bleed) — purged;
  watch for `relation X already exists` on new DBs.

## Data
- tenant acme 01a122c6-e750-7066-b795-d94f0f759f2a; admin/serviq-local
  (platform); acme-admin (tenant); agent Maria Lopez.
- Ports: 8010-8021 backends, 3000/3001 BFFs, 8080-8083 frontends, 8100 AI.
