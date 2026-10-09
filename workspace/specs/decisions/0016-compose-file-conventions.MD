# ADR-0016: `services/docker-compose.yml` — filename, location, and tracking

- Status: Accepted
- Date: 2026-10-10

## Context

The local stack file needed a name (compose.yaml vs docker-compose.yml), a home (repo root vs
`services/`), and a git policy (the infra README historically said service-definition files
should be untracked with only `*.dist` templates committed).

## Decision

- **Filename:** `docker-compose.yml` — the most recognized name; Compose v2 treats it
  identically to `compose.yaml`.
- **Location:** `services/docker-compose.yml` — it orchestrates the contents of `services/`.
  Run `docker compose` from `services/` or pass `-f services/docker-compose.yml` from root.
- **Tracking:** committed. It defines shared topology with no secrets; the infra policy was
  narrowed to cover machine-specific config and credentials only (`.env` stays gitignored,
  `.env.example`/`*.dist` templates are committed).

## Alternatives considered

- `compose.yaml` at root — newer canonical name, but less recognizable and the root location
  implied it orchestrates the whole repo rather than the service tier.
- `*.dist` template + gitignored real file — forces every clone through a copy step for zero
  benefit since nothing in the file is machine-specific.

## Consequences

- `docker compose --profile full up` is the single documented bring-up path.
- Secrets live only in gitignored `.env` files materialized by `scripts/install.sh`.

See: `technical/infrastructure/README.MD` (infrastructure configuration policy).
