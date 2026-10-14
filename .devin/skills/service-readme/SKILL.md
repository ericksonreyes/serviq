---
name: service-readme
description: ServIQ service README conventions — purpose-first structure, tables over prose, ops runbook; how to write or refresh a services/*/README.MD
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - write
  - exec
---

Conventions for writing or refreshing `services/*/README.MD`. The reference
implementation is `services/serviq-ai-agent/README.MD`.

## The failure mode to avoid

A README that reads like a notepad or ADR dump: dense paragraphs of inline
decisions, stale numbers copied from code, no answer to "what is this for".
Write for the reader who has never opened the service — purpose first,
mechanics second, decisions only where they affect usage.

## Required structure

```markdown
# <Service Name> (:<port>)

<Two-line identity: what it is + its hard boundary/invariant.>

## What it's for
<Domain framing — the reality it serves, in 2–4 bullets. Who uses it and
for what job. Plain language, no ADR references.>

## Surface
| Endpoint / flow | Purpose |
<One row per endpoint, event consumed/emitted, health check.>

## <Domain sections — providers, pipeline, data model>
<Tables for anything tabular. Bullets for rules. Prose only where a
sentence is genuinely clearer.>

## Layout
<One-line-per-module file tree, only if the service is non-trivial.>

## Ops
| Task | Command |
<Tests, evals, restart/recreate gotchas, health endpoint.>

## Architecture
| Discipline | How it shows up here |
<Each engineering discipline the service claims (DDD, hexagonal, SOLID,
EDA, CQRS, etc.) mapped to concrete evidence in this codebase — name the
ports, adapters, composition root, flows. Spec/ADR links are citations
inside the descriptions, never the whole answer.>
```

## Rules

- **Tables over prose** for env vars, endpoints, provider defaults,
  commands — anything a reader scans rather than reads.
- **Point at canonical sources, don't restate them.** `.env.example` is
  the env contract — the README summarizes the shape and links to it, it
  does not copy every key. Glossary terms come from
  `workspace/specs/domain/specs/GLOSSARY.MD`.
- **Exception: architecture adherence is described, not delegated.** The
  POC exists to demonstrate DDD/hexagonal/SOLID/EDA — the README must
  show the evidence in this service's code (which files are the ports,
  the adapters, the composition root, the event flow). Links to specs and
  ADRs support the claim; a bare "see workspace/specs" link is not the
  claim.
- **Don't quote volatile numbers** (dataset sizes, counts) — reference the
  artifact (`evals/dataset.jsonl`) so the doc can't drift from reality.
- **Document operational gotchas in Ops** — e.g. `.env` is baked at
  container creation (`up -d`, not `restart`), provider model names churn
  (404 = retired, 503 = saturated).
- **Resilience/degradation gets one line, not a story.** State what
  happens when a dependency fails; skip the incident retrospective.
- Keep ADR/spec references to a single parenthetical in the intro — the
  README is an operator's doc, not the decision record.
- Match sibling conventions: same section names (`Surface`, `Ops`) across
  services so the 19-service family reads consistently.
