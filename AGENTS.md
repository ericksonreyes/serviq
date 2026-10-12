# ServIQ Documentation Governance

This file guides documentation-oriented work in the ServIQ repository.

## Safety Guardrails

- **Stay inside the repository.** Do not create, modify, rename, or delete any file or directory outside the ServIQ repository root. If a task seems to require touching something outside it, stop and ask first.
- **Human-in-the-loop for destructive operations.** Never run destructive commands or use destructive tools without explicit user confirmation for that specific action. This includes: deleting or overwriting files/directories (`rm -rf`, `rm`, truncating files), dropping or mutating database data (`DROP`, `TRUNCATE`, bulk deletes), git operations that rewrite or discard work (`git reset --hard`, force-push, deleting branches, checking out over uncommitted changes), and any command with irreversible real-world side effects.
- When a destructive step is genuinely needed, describe exactly what will run and why, then wait for the user's go-ahead.
- Prefer reversible operations; when in doubt, ask rather than act.

## Canonical Sources

- Use `workspace/specs/PROJECT_PURPOSE.MD` as the source of truth for project intent and the engineering capabilities this portfolio demonstrates.
- Use `workspace/specs/GLOSSARY.MD` as the source of truth for shared vocabulary.
- Use `workspace/specs/domain/specs/DOMAIN_BOUNDARIES.md` for the high-level domain model and bounded-context map.
- Use `workspace/specs/technical/README.MD` for engineering disciplines, architecture principles, and quality attributes.
- Use `APP_FEATURES.MD` (repo root) as the canonical inventory of app features per portal — ✅ marks implemented (end-to-end: UI wired to live APIs, not scaffolds), unmarked means proposed.
- Record significant architecture decisions as ADRs in `workspace/specs/decisions/` — immutable once accepted; supersede, never rewrite; update its index.
- Use `workspace/specs/technical/user_experience/README.MD` for UX guidance.

## Repository Layout and Service Map

- Use `services/` for the application code repositories and service implementations.
- Development setup: run `./scripts/install.sh` (env templates + staged stack) and `git config core.hooksPath .githooks` once per clone — the pre-commit hook blocks backup/temp files and secret-shaped content from entering history.
- Use `SERVICE_MAP.md` as the canonical inventory/map of services in the repository.
- Keep each service entry in `SERVICE_MAP.md` aligned with its directory under `services/`.
- When a service is added, renamed, moved, or removed, update `services/` and `SERVICE_MAP.md` in the same change.
- Every `services/` directory must contain a committed `.env.example` (or `.env.dist`) preconfigured for the Docker network — compose service names as hosts, local-safe defaults, no secrets. `scripts/install.sh` copies them to `.env` and starts the stack in stages (infra → domain → AI → frontends).
- When a service gains its `Dockerfile`, uncomment its entry in `services/docker-compose.yml` in the same change — the commented entries are the implementation checklist.
- Prefer a simple per-service record with `name`, `description`, and `location` fields.

## Runtime and Toolchain

- **Never run host-installed language runtimes or package managers** (php, node, python, composer, npm, pip) for repo tasks — tests, builds, dependency installs, and script executions all run inside Docker. Host toolchains drift from the service's declared requirements and are a source of lockfile divergence: e.g., running `composer update` under an older host PHP can resolve a dependency set the production image can't run.
- **Derive the container from the manifest, not from whatever image happens to be built.** `composer.json require.php` → `php:X.Y-cli`; `package.json engines.node` → `node:N-alpine` (fall back to `@types/node` major, then 22); Python services run in their own image whose pip-installed deps are the pinned contract.
- For dependency installs prefer the tool's official image: `composer:2` for PHP deps (with `--ignore-platform-req=ext-sockets` as `install.sh` does), `node:N` for npm work. Never let the package manager run on the host — its `*-lock`/`composer.lock` output differs across runtime versions and that divergence ships bugs.
- `scripts/test.sh` is the reference implementation — use it rather than ad-hoc commands; extend it rather than working around it.
- **Never run `phpunit`/`artisan test` inside a running service container** (`docker exec serviq-*-backend vendor/bin/phpunit`). Containers export their real `.env` (`DB_CONNECTION=pgsql`), `phpunit.xml` `<env>` values do not reliably override exported variables, and `RefreshDatabase` then runs `migrate:fresh` on the live dev database — wiping it. Each service's `tests/bootstrap.php` hard-aborts on non-sqlite connections; run suites via `./scripts/test.sh` (clean `php:X.Y-cli` container) or with explicit `-e DB_CONNECTION=sqlite -e DB_DATABASE=:memory:` overrides.

## Session Handoffs

- Use `workspace/handoff/` for session handoff notes; see `workspace/handoff/README.MD` for the format.
- Write a handoff when wrapping up or pausing mid-work (`/checkpoint`); resume from the newest handoff file (`/restore`).
- Handoffs reference specs — they do not replace them. Decisions belong in `workspace/specs/`.

Example service-map entry format:

```md
- name: Customer Portal
  description: Customer Portal PWA
  location: services/serviq-customer-portal-pwa/

- name: Customer Portal BFF
  description: Customer Portal Backend For Frontend
  location: services/serviq-service-provider-portal-bff/
```

## Documentation Structure

- Prefer one canonical file per topic.
- Use `README.MD` files as folder index pages.
- Keep index pages high level and move detailed content into dedicated markdown files.
- Use compatibility stubs only during migration, and remove them once all references are updated.
- When a document is moved or renamed, update every inbound and outbound link in the same change.

## Vocabulary Rules

- Prefer the canonical term in the glossary over older or competing terms.
- If a document needs an alternate or historical term, note it explicitly rather than mixing terms casually.
- Update the glossary whenever a new cross-cutting term is introduced or an existing term is renamed.

## Link and Consistency Rules

- Prefer relative links that resolve from the file location.
- Verify new links after edits, especially when folders move or are renamed.
- Keep terminology consistent across root, domain, and technical documentation.
- Add new cross-cutting documents to the main index pages so they remain discoverable.

## Git Conventions

- When asked for a commit message, draft the message only — do not run `git commit`
  unless the user explicitly asks to commit.

## Review Checklist

- Confirm the target file exists.
- Confirm the link paths are correct from the file location.
- Confirm the terminology matches the glossary.
- Confirm temporary migration notes or stubs are removed when they are no longer needed.
