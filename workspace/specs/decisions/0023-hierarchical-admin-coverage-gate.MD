# ADR-0023: Hierarchical administrative coverage as the booking gate

- Status: Accepted
- Date: 2026-10-13

## Context

Service areas existed as documentation data: `service_areas.geo` was a free-form
jsonb descriptor ("polygon, barangays, zips") that no code read, and booking
(`POST /v1/requests`) validated nothing — an out-of-area address became a
request a dispatcher had to cancel manually. Enforcement needed three things
the old shape lacked: structured coverage data, a controlled address
vocabulary, and a backend-owned check at request creation.

Two candidate mechanisms: geocoding + polygon containment (accurate, but needs
a geocoder — self-hosted Photon/OpenSearch ≈ 2 GB RAM on an 8 GB host, and
OSM's Philippine street coverage is uneven) versus administrative-area
membership (the question asked is membership — "do you cover this barangay" —
not geometry).

## Decision

Coverage is stored as **administrative codes at any hierarchy level**:
`service_areas.geo = { admin_areas: [<code>…], exclusions: [<code>…],
countrywide: <bool> }`. A new `locations` reference table
`(code, name, level, parent_code, country)` holds the hierarchy — country-
agnostic schema; the PH deployment seeds PSGC (PSA) data
(`database/data/locations_ph.csv`, 43,769 rows, ~2 MB). Other markets seed
the same shape from their national coding system; the `country` column scopes
each seed. `geo.polygon` remains a supported escape hatch for markets without
clean admin data.

Enforcement is an **ancestor walk**: the submitted address resolves to the
deepest location code; walking self → root through `parent_code`, the first
node appearing in either `admin_areas` or `exclusions` decides (nearest
explicit answer wins — granular re-adds inside excluded regions work).
`countrywide` short-circuits. Nothing declared → open by default, so
enforcement binds only once a tenant documents coverage.

Ownership: Service Management owns `locations`, service areas, and the
`GET /v1/tenants/{tenant}/coverage/check` probe. CRM's `store` calls it
synchronously with the caller's JWT forwarded verbatim — no cross-context DB
read; a domain-event projection is the documented path if the sync hop ever
hurts. Outcomes: `outside`/`excluded` → 422 `outside_coverage`; no code while
enforcement binds → 422 `address_unverifiable`; probe down → 503
`coverage_unavailable` (fail closed — an unverified booking is worse than a
retryable error). The resolved `admin_code` is stored in `details` for later
dispatch/area matching.

UX: the Tenant Console Areas page gains a "type what you cover" input —
deterministic name matching (ranked contains-search; no LLM — the parse
must be exact, fast, and auditable) emitting coverage chips with breadcrumb
paths and redundancy hints. The portal Book page replaces free-text city and
barangay with cascading pickers, so submissions always carry the deepest
code; a preflight coverage probe gives early warning while the backend check
stays authoritative.

Rejection is a landing, not a dead end: `outside`/`excluded` verdicts carry
`covered_names` (top-level covered nodes — customers often have a second
plausible address; "nearest" is meaningless for come-to-you service), and
the portal offers "let the provider know I'm interested" →
`POST /tenants/{t}/coverage/interest` records
`coverage_interest (tenant, admin_code, user_id-from-token)` idempotently.
The Areas page shows demand grouped by location so expansion decisions sit
next to the coverage form. `ServiceManagement.CoverageInterested` rides the
event bus for a later notify-on-expansion flow.

## Alternatives considered

- Self-hosted Photon + polygons — rejected for now: ~2 GB RAM against an
  already-tight Docker budget, OSM PH street coverage is uneven, and
  membership (not geometry) is the question being enforced. Polygon stays a
  supported `geo` key if sub-barangay precision is ever needed.
- Public geocoder APIs — rejected: rate limits, third-party terms, and an
  internet dependency for a check PSGC data answers locally.
- LLM-assisted coverage parsing (Ollama) — rejected: the grammar is tiny
  (scope words + place names), the LLM can't emit codes it doesn't know,
  cold-load latency is wrong for a typing loop, and coverage is a contract
  where a misparse silently mis-gates customers. AI fits as a side channel
  (chat tool, document→suggested-chips), never the parse of record.
- Event-driven coverage projection into CRM — deferred: correct end state
  for availability; the sync probe is the POC-honest step (ADR documents
  the coupling deliberately).

## Consequences

- Providers declare coverage at the granularity they think in: "whole
  Marikina City" is one entry, not sixteen barangay rows; "all of NCR" is
  one region code; "nationwide" is a flag.
- Booking now rejects out-of-area and unverifiable addresses server-side;
  saved addresses without codes must be re-entered once when enforcement
  binds. Rejected customers can register interest per location — the demand
  list is tenant-scoped and deduped per user.

- The `JwtVerifier` boot probe (`AppServiceProvider::boot`) no longer
  memoizes signing mode on the singleton — it probes on a throwaway
  instance. Repo-wide latent bug: tests minting RS256 tokens got 401s
  because boot resolved HS256 first. Fixed in service-management and CRM;
  the other eight services carry the same pattern.
- Known gap: agent `service_areas` name-matching (workforce eligibility)
  does not yet consume `admin_code` — bridging dispatch to the same code
  vocabulary is a follow-up.

See: `domain/specs/DOMAIN_BOUNDARIES.md`, `technical/security/README.MD`.
