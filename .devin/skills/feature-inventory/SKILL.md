---
name: feature-inventory
description: ServIQ app-feature inventory — APP_FEATURES.MD marking convention (✅ = implemented end-to-end), verification bar, and update discipline
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - write
  - exec
---

`APP_FEATURES.MD` at the repo root is the canonical inventory of user-facing ServIQ features, organized by portal (Customer Portal, Service Agent Portal, Tenant Console, Platform Admin Console). Keep it current as code lands.

## Marking convention

- ✅ — implemented
- No mark — proposed (specified in domain/persona/AI specs, not yet built)

No separate "Implemented"/"Proposed" sections — one merged list per portal, implemented items first. Tenant Console keeps per-role subsections (Tenant Administrator, Dispatcher, Customer Support) below its implemented items.

## The ✅ bar — verify, don't trust

✅ means end-to-end: where a feature spans a frontend and backend, the UI must be wired to live APIs. A scaffolded page, mock data, or a route-less frontend does not qualify.

Before marking or confirming ✅, check both ends:

- Frontend calls real endpoints — `src/api.js` (or equivalent) issues `fetch` calls to `VITE_*_API_URL` bases, not fixtures.
- Backend route exists — Laravel: `routes/api.php` `Route::` registrations; Express BFFs: `app.get`/`app.post` handlers.
- BFF fan-out: if a BFF proxies to upstream context services, confirm those upstream routes exist too.

## Update discipline

- When a feature ships, mark it ✅ in the same change — don't wait for a doc sweep.
- When specs propose a new user-facing feature, add it unmarked under the right portal (and role subsection for Tenant Console).
- Chatbot tool inventories stay nested under their portal's chatbot bullet, keyed by tool name.
- On rename/move, update every inbound link in the same change (currently referenced from `workspace/specs/README.MD`) and verify relative links resolve.
