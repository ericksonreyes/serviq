# Engineering Disciplines

This folder provides a high-level overview of the architecture principles and quality attributes ServIQ should use while designing the platform. The linked items below point to recommended further reading.

## Development Disciplines

- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)

## Architecture Principles

- [Event-Driven Architecture](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven)
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Command Query Responsibility Segregation (CQRS)](https://martinfowler.com/bliki/CQRS.html)
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Distributed Systems](https://en.wikipedia.org/wiki/Distributed_computing)
- JWT-based authentication for stateless API access

## Quality Attributes

- [Observability](https://opentelemetry.io/docs/concepts/observability-primer/)
- [Scalability](https://learn.microsoft.com/en-us/azure/architecture/guide/design-principles/scalability)
- [Reliability](https://learn.microsoft.com/en-us/azure/well-architected/reliability/)
- [Performance](https://learn.microsoft.com/en-us/azure/architecture/framework/scalability/performance-efficiency)
- [Availability](https://learn.microsoft.com/en-us/azure/well-architected/reliability/availability)
- [Security](https://learn.microsoft.com/en-us/azure/well-architected/security/)
- [Resilience](https://learn.microsoft.com/en-us/azure/well-architected/reliability/)
- [Maintainability](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/)
- [Operability](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/)

## How These Disciplines Are Used

These practices guide how ServIQ should be built, but they do not replace the domain documentation.

- The **domain** docs describe the business capabilities and bounded contexts.
- The **technical** docs describe how the system should be implemented.
- The implementation should stay aligned with both the domain model and the architecture principles.

## Related Documentation

- [User Experience](./user_experience/README.MD)
- [Glossary & Vocabulary](../GLOSSARY.MD)
- [Service Stacks](./SERVICE_STACKS.MD) — per-family framework/library policy and CQRS read/write storage split
- [Security & Access Control](./security/README.MD) — JWT validation and role/permission policy example
- [Infrastructure & Local Development](./infrastructure/README.MD)
- [Proof of Payment OCR/LLM Stack](./infrastructure/PROOF_OF_PAYMENT_OCR_LLM_STACK.MD) — Docker-only OCR/LLM guidance with AWS comparison notes
- [Payout Gateway Port](./infrastructure/PAYOUT_GATEWAY_PORT.MD) — Hexagonal Architecture payout port contract and fake local adapter
- [Domain Boundaries](../domain/specs/DOMAIN_BOUNDARIES.md)
