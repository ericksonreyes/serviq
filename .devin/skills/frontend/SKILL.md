---
name: frontend
description: ServIQ frontend conventions — React+Vite single stack, per-channel apps, design language (Nunito/Caveat, pastel violet/teal palette, radius+density rules, mobile-first), dev-server env gotcha, vite dev hot reload
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - write
  - exec
---

Conventions for the four channel frontends. STATUS: all four apps are scaffolded (React + Vite; MUI on portal/agent, Tailwind on console/admin) with login wired against IAM. Sign-up: customers and agents self-register via `/signup` on their channels (IAM `auth/register`, self-serve roles only); service providers sign up as tenants via `/signup` on the Tenant Console (Platform Management `tenants/signup` → PENDING review). Library patterns are pinned in `SERVICE_STACKS.MD` — see "Library patterns" there.

## Decided

- **One framework**: React (latest) + Vite for ALL channels — Customer Portal, Service Agent (PWA), Tenant Console, Platform Admin. NextJS was dropped deliberately: every app is post-auth API-driven, SSR buys nothing.
- **CSS is channel-appropriate**: **Material UI** on end-user channels (Customer Portal, Service Agent — accessibility defaults, mobile/PWA components); **Tailwind** on internal admin UIs (Tenant Console, Platform Admin — dense custom layouts). Per ADR-0017.
- **Runtime**: `vite dev` hot-reload servers are the only local shape — the `*-dev` services in `docker-compose.yml` (profiles `dev` and `full`, ports 8080–8083), `node:22-alpine`, bind-mounted source, `node_modules` self-installed on boot. Static `vite build` → nginx is a deployment concern, not part of the local stack.
- **Env**: `VITE_*` vars are inlined at dev-server start — values must be `localhost` host-mapped ports (the browser can't resolve compose DNS). Per-service examples in each frontend's `.env.example`. Changing a VITE var requires restarting the dev container.
- **Auth**: JWT bearer from IAM. Login/register/invite-accept return an `access_token` (1h) + `refresh_token` (30d, `JWT_REFRESH_TTL`) pair; `POST /auth/refresh` rotates (old refresh revoked → reuse fails closed); `POST /auth/logout` blacklists the access `jti` and revokes the supplied refresh token. Each app's `auth.jsx` stores the pair — "Keep me signed in" checked → `localStorage['serviq.token'`/`serviq.refresh']`, unchecked → `sessionStorage` — and registers `setUnauthorizedHandler` so `api.js` retries a 401 once after a silent refresh. `refreshSession()` also runs on mount when only a refresh token survives. Sign-out must call `api.logout(token, refreshToken)` (best-effort `.catch`) before `setToken(null)`.
- **Ports**: 8080 customer-portal, 8081 service-agent, 8082 tenant-console, 8083 platform-admin.

## Channel notes

- Customer Portal & Service Agent talk ONLY to their BFF (3000/3001) — never directly to domain APIs.
- Tenant Console & Platform Admin call admin APIs directly (8010–8021) — they're browser-facing by design.
- Service Agent frontend is a PWA — field use implies offline tolerance and mobile-first layout.

## Design language (owner-specified)

- **Fonts**: Nunito = base UI font everywhere; Caveat = display/script accent (wordmarks, poster-style headlines). Both loaded via Google Fonts in each app's `index.html`; Tailwind apps expose them as `--font-sans` / `--font-display` (`font-display` utility).
- **Palette**: pastel violet + teal, indigo ink. Primary `#7c3aed` violet (hover `#6d28d9`/`#5b21b6`), accent `#14b8a6` teal, surfaces `#faf5ff`/`#f3e8ff` pastel violet, dark chrome + headings `#1e1b4b` indigo-950, gradients `#1e1b4b → #6d28d9`. Neutral `slate-*` stays for body text/borders/subtle fills. Tailwind apps encode these as `brand-*`/`accent-*`/`ink-*` `@theme` tokens — use tokens, not raw hex, in new Tailwind code.
- **Corners**: rounded but NOT excessive — MUI theme base `shape.borderRadius: 12`; never stack sx multipliers (`borderRadius: 3` = 36px was rejected). Tailwind: `rounded-lg`/`rounded-xl` for cards, not `rounded-3xl`.
- **Density**: cards and auth screens must breathe — roomy padding (`p: {xs:4, sm:6}` on auth Papers), `spacing: 2.5` field stacks, `size="large"`/`py:1.25` primary buttons. "Too tight" was rejected on login/signup cards; cards cap ~460px wide but pad generously.
- **Type size**: don't go small — MUI base `fontSize: 16`, `body2` stays ≥0.95rem at weight 500 (Nunito reads thinner than Inter at equal px), `caption` ≥0.8rem. The owner flagged undersized text after a 15px base — err larger, especially on the agent PWA (sunlight/gloves).
- **Tailwind scale (consoles)**: one readable scale — `text-sm` for ALL interactive/readable elements (inputs, selects, buttons, table cells, badges, chips, checkbox lists); `text-xs` is captions-only (muted secondary lines, uppercase tracked labels/`Th`, `font-mono` for raw UUIDs/ids where density matters). Control height is uniform: `px-3 py-2` inputs/selects/buttons (~36px) — never mix `text-base`/`py-2.5` inputs with `text-sm` buttons. Badges are never smaller than body text (`px-2.5 py-0.5 text-sm`). `index.css` uses `font: inherit` on form elements — do NOT re-add a `1rem` floor, it re-introduces the mixed scale.
- **Mobile-first is a hard requirement**: internal consoles use a drawer sidebar below `md:` (hamburger + scrim, auto-close on nav), page padding `p-4 sm:p-6`. Agent PWA: large touch targets, one-handed use.
- **Tables collapse to cards below `sm:`** — a bare `overflow-x-auto` table is a bug, not a fallback (it clips and side-scrolls). Pattern: wrap the `<table>` in `hidden sm:block overflow-x-auto`, render a sibling `sm:hidden divide-y divide-slate-100` card list (title row + status badge on top, fields under, actions last). Rows with expandable panels extract their state into a `use*State` hook shared by the `<tr>` and card variants (see `admin/Users.jsx`, `dispatch/Evidence.jsx`).
- **Filter/autocomplete inputs debounce**: search boxes and combobox filters must debounce the query at ~500ms before applying it — use the shared `useDebounced(value)` hook (each Tailwind app's `src/hooks.js`; MUI apps inline the same pattern). Applies to long-list pickers (tenant/agent/user selects) — prefer a searchable combobox over a plain `<select>` once the list can grow (e.g. platform-admin's `ScopePicker` in Users.jsx).
- **Search inputs get an explicit submit + busy indicator**: a list-search textbox pairs its debounce with a form `onSubmit` Search/Go button (Enter or click runs the query on the *current* text, bypassing the debounce wait), and every in-flight query must show visible feedback — disabled button with `Searching…` label plus a hint line near the results. Never leave the user guessing whether a search is running (see `platform-admin/Tenants.jsx`).
- **E2E selector caution**: `tests/e2e/chatbots.mjs` selects chat replies by `div.bg-slate-100` — don't restyle that class.

## UX

Follow `workspace/specs/technical/user_experience/README.MD` — see the `ui-ux` skill for application rules.

## Docs visuals

User-facing flows get Playwright screenshot scripts (`scripts/screenshots/`); guides embed
the generated images — never hand-captured. See the `user-guide` skill (ADR-0018).
