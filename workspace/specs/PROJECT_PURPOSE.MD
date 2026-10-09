# Project Purpose

ServIQ is a **portfolio project**. Its purpose is to demonstrate production-grade engineering judgment on a realistic multi-tenant SaaS problem — not just to ship features.

Every architectural choice in this repository should be explainable against the capabilities below. When adding features, prefer the option that exercises these disciplines over the option that is merely easiest.

## Capabilities Demonstrated

| Capability | Where it shows up |
| --- | --- |
| **Agentic Engineering** | The [AI Agent service](technical/ai/README.MD) — context-scoped profiles, tool isolation, human-in-the-loop evidence handling |
| **Domain-Driven Design** | [Domain Boundaries](domain/specs/DOMAIN_BOUNDARIES.md) — bounded contexts, canonical vocabulary, per-service data ownership |
| **AI Agents, RAG, Vector Engineering** | [Agent Profiles](technical/ai/AGENT_PROFILES.MD), the vector search port, curated-document retrieval for repair guides and policies |
| **Containerized environments** | [Infrastructure & Local Development](technical/infrastructure/README.MD) — every dependency runs in Docker, no native installs |
| **Hexagonal Architecture** | Ports and adapters everywhere: payout gateway, LLM inference, vector search, messaging, persistence |
| **Software design patterns** | BFF for the Customer Portal, ports/adapters, CQRS read/write split, policy-gated tools |
| **Event-Driven Architecture** | Domain events over the message broker (e.g. `JobCompleted` → Billing invoicing); no cross-service database coupling |
| **Microservices Architecture** | [SERVICE_MAP.md](../../SERVICE_MAP.md) — one service per bounded context, each owning its store |
| **Event Sourcing as source of truth** | Service Job Management, Billing, and Payouts persist event streams; see [Service Stacks](technical/SERVICE_STACKS.MD) |

## Non-Goals

- This is not a production SaaS — scope decisions favor demonstrating discipline over completeness.
- **Production deployment is out of scope.** The target is the full system running simultaneously in Docker containers on a development machine as a proof of concept. Ports and adapters keep managed/cloud swaps possible later, but no production infrastructure is planned or required.
- Enterprise extras (tax engines, reconciliation automation, fraud ML) are intentionally out of scope where noted in the specs.

## Working Rule for Contributors and Agents

When a design choice is ambiguous, ask: **which option better demonstrates the capabilities above?** Prefer explicit ports over hidden dependencies, events over shared tables, and domain rules in services over convenience logic in callers.

## Related Documentation

- [Workspace Specs](./README.MD)
- [Domain Boundaries](domain/specs/DOMAIN_BOUNDARIES.md)
- [Engineering Disciplines](technical/README.MD)
- [Service Stacks](technical/SERVICE_STACKS.MD)
- [SERVICE_MAP.md](../../SERVICE_MAP.md)
