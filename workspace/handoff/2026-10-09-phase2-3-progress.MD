# Phase 2–3 implementation progress (running ledger)

Done + verified live in stack (all uncommitted):
- IAM :8010, Platform Mgmt :8011, Service Mgmt :8012, Customer-Request :8013,
  Service-Job :8014, Workforce :8015, Assignment-Dispatch :8016,
  Notification :8019. All Laravel scaffolds via scripts/scaffold-service.sh
  (args: dir db queue; copies PM skeleton + RequireTenantScope + alias).
- Verified flows: tenant create→IAM scope via Platform.TenantCreated; tenant
  admin login; catalog+template; Request.Submitted→job auto-created;
  confirm→ready→automatic dispatch→Assignment.Accepted→Job.Assigned;
  step events; replay rebuilds jobs; notification consumer '#' → in-app feed.
- Tenant acme (TID 01a122c6-e750-7066-b795-d94f0f759f2a), users admin/platform
  (token /tmp/tok) + acme-admin/tenant (token /tmp/ttok), agent Maria Lopez.

Key patterns:
- Consumer containers: `sh -c '(until php artisan outbox:publish; do sleep 5;
  done) & exec php artisan events:consume'` (retry loop — relay used to die
  before migrations). Dispatch adds offers:expire loop too.
- Pub/sub gap: events published before a service's queue exists are LOST —
  re-emit (e.g. re-register agent) or accept fallback defaults.
- Compose builds one image PER service name — build api+consumer after edits.
- Each new service: rm PM leftovers (Tenant/Plan/FeatureFlag, *platform*
  migration, specs, TenantContext), write migration+models+domain+controllers+
  routes+seeder+spec/behat+README, bootstrap tenant.scope alias, uncomment
  compose api+consumer, build BOTH, verify, done.
- Event names: <Context>.<ThingVerb> (Request.Submitted, Job.Completed,
  Assignment.Accepted, Workforce.AgentRegistered, ServiceManagement.*).
- JwtVerifier everywhere (JWKS→IAM), tenant.scope middleware for tenant APIs,
  role:Platform Administrator for platform-only APIs.
- Ports reserved: 8017 field-service, 8018 customer-support, 8020 billing,
  8021 payouts; BFFs/frontends per compose comments.

Remaining (BUILD_SEQUENCE order): field-service-execution :8017, billing :8020,
payouts :8021, customer-support :8018, ai-agent, customer-portal-bff
(NestJS+MongoDB), service-agent-bff, 4 frontends, --profile full verify.
