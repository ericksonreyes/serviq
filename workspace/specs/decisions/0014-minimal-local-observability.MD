# ADR-0014: Minimal local observability — Fluent Bit to stdout, searchable sink optional

- Status: Accepted
- Date: 2026-10-10

## Context

Early plans ran OpenSearch + Dashboards locally for searchable logs — ~1.1GB of JVM footprint,
the single largest infra consumer, against an 8GB machine where model weights already spike.

## Decision

Local observability is Fluent Bit collecting container logs to **stdout only** (~30MB).
A searchable sink (OpenSearch ~600MB capped, or Loki ~300MB) is a documented *optional*
adapter behind the observability port — enabled only when a demo specifically needs log
search. Structured JSON logging (`app`, `service`, `environment`, `level`, `message`,
`requestId`, `traceId`, `timestamp`) is still required so a sink can be switched on cleanly.

## Alternatives considered

- OpenSearch always-on, heap-capped — the portfolio-nice option, but ~700MB steady for a
  component most sessions never query.
- Loki + Grafana — ~300MB, still a JVM-free lighter choice; kept as the named alternative
  rather than the default.
- Dozzle — ~10MB log viewer; too thin to demonstrate the port concept.

## Consequences

- Steady-state drops ~600MB; the observability story becomes "structured logs ready for any
  sink" — which is arguably the better engineering narrative.
- Enabling the sink is a documented flip: change the Fluent Bit `[OUTPUT]` block + uncomment
  the adapter container.

See: `technical/infrastructure/README.MD` (Observability port), `LOCAL_RESOURCE_BUDGET.MD`,
`workspace/infra/fluent-bit/fluent-bit.conf`.
