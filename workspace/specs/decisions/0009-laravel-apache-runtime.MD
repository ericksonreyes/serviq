# ADR-0009: `php:apache` (mod_php) for Laravel services

- Status: Accepted
- Date: 2026-10-10

## Context

Twelve Laravel backends need a containerized runtime. Options spanned Lumen (lighter
framework), Octane/FrankenPHP (worker mode), FPM+nginx (two processes), and the conventional
Apache image.

## Decision

Simple `php:<ver>-apache` containers running mod_php — one process model, conventional
Dockerfile, no tuning complexity. Octane/FrankenPHP is explicitly deferred until a real
constraint demands it.

## Alternatives considered

- Lumen — effectively maintenance-mode; breaks `spatie/laravel-event-sourcing`; saves only
  ~10–30MB per container; reads as dated in a portfolio.
- Octane/FrankenPHP worker mode — faster and lighter per request, but adds worker-mode
  complexity (state leakage discipline, different failure modes) before it's needed.
- FPM + nginx per service — two processes or supervisor gymnastics ×12; complexity for no
  POC benefit.

## Consequences

- Boring, well-documented runtime — the architecture is the point, not PHP throughput.
- No official apache-alpine exists, so the PHP tier stays Debian — accepted disk cost
  (see ADR-0015).
- If profiling later shows PHP is the bottleneck, FrankenPHP is a documented upgrade, not a
  redesign.

See: `technical/SERVICE_STACKS.MD`,
`technical/infrastructure/LOCAL_RESOURCE_BUDGET.MD`.
