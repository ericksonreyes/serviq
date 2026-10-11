---
name: agentic-engineering
description: How to work inside the ServIQ repo as an agent — governance, canonical doc sources, handoff discipline, spec-audit practice
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - write
  - exec
---

Operating rules for agentic work in this repository.

## Governance

- `AGENTS.md` is the documentation governance contract — canonical sources, vocabulary rules, link rules, review checklist. Follow it literally.
- One canonical file per topic. Never fork a spec into a second doc; edit the canonical one.
- `workspace/specs/GLOSSARY.MD` is the vocabulary source of truth — use canonical terms, don't introduce competing terminology casually.
- Use relative links; verify they resolve after edits (`test -f` from the linking file's directory).
- Handoffs live in `workspace/handoff/` in the format its `README.MD` defines. Use the `/checkpoint` skill to write one.

## Repo shape

- `services/` — 19 service dirs (4 React+Vite frontends, 12 Laravel context backends, 2 Express BFFs, 1 FastAPI AI agent). Empty scaffolds until Dockerfiles land.
- `services/docker-compose.yml` — the local stack. App entries are commented stubs: **uncomment a service's entry in the same change that adds its Dockerfile.**
- `scripts/install.sh` — env copy + staged bring-up. `.env.example` in every service dir, Docker-network hostnames, never real secrets.

## Audit discipline

- `workspace/specs/AUDIT.MD` is the canonical audit log. New contradiction/orphan/risk findings go there first with evidence links and status; close items by fixing the referenced specs, not the audit text.

## Standing constraints (don't relitigate)

- AI never touches databases or makes domain decisions — see the `ai-agent-boundary` skill.
- Production deployment is out of scope; all-services-in-Docker is the POC target; tiered profiles are the memory fallback.
- Everything in the repo is intentionally uncommitted until the user asks for a commit.
