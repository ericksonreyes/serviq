# Infrastructure & Local Development

This document describes how ServIQ should be run locally and how infrastructure dependencies should be modeled so they can be swapped between self-managed and managed services.

## Goals

- Keep local development reproducible and easy to start.
- Avoid native installs in local development; every local dependency must be runnable in Docker.
- Minimize dependence on paid managed services during development and testing.
- Use the same domain-facing interfaces regardless of whether a service is local, self-managed, or cloud-managed.
- Make infrastructure changes possible without rewriting business logic.
- Keep local logs grouped by app and searchable by keyword during development.

## Local Development Approach

For local testing, run all supporting services in Docker containers rather than depending on native installs or external cloud services.

### Suggested local services

- **RabbitMQ** — message broker for asynchronous work and event delivery, used as a local replacement for services such as SQS and SNS.
- **PostgreSQL** — local relational store for command/write models, used as a replacement for managed relational databases such as Amazon RDS or Aurora.
- **MongoDB** — local document store for CQRS read models, used as a replacement option for managed document storage such as Amazon DocumentDB or DynamoDB.
- **OpenSearch + OpenSearch Dashboards** — local log indexing and search for app-grouped, keyword-searchable logs.
- **Fluent Bit** — lightweight log shipping from Docker containers into OpenSearch.

Services should emit structured JSON logs with fields such as `app`, `service`, `environment`, `level`, `message`, `requestId`, `traceId`, and `timestamp` so logs can be grouped and searched by application.

The exact local stack can evolve over time, but the goal is always the same: developers should be able to run the system end-to-end without needing production cloud infrastructure.

## Hexagonal Architecture Fit

ServIQ should depend on **ports** for external capabilities and use **adapters** for concrete implementations.

That means:

- the application code talks to abstractions, not vendor-specific services;
- local Docker services implement one set of adapters;
- managed cloud services implement another set of adapters;
- switching from self-managed to paid managed services should be an infrastructure change, not a domain change.

### Infrastructure configuration policy

- Infrastructure-level configuration and service-definition files should be untracked or ignored by git.
- When a local-development reference is needed, keep only a `*.dist` configuration file in the repository.
- CI/CD should supply the runtime dependencies and final configuration so deployed infrastructure remains the source of truth.

## Example Port and Adapter Areas

- **Messaging port**
  - Local adapter: RabbitMQ
  - Managed adapter: SQS / SNS or another managed messaging service
- **Persistence port (command model)**
  - Local adapter: PostgreSQL
  - Managed adapter: Amazon RDS / Aurora or another managed relational database
- **Persistence port (read model)**
  - Local adapter: MongoDB
  - Managed adapter: Amazon DocumentDB or another managed document store
- **Payout port**
  - Local adapter: fake payout gateway or deterministic payout stub
  - Managed adapter: bank transfer API or another managed payout provider
- **Observability port**
  - Local adapter: OpenSearch + OpenSearch Dashboards + Fluent Bit for logs, with optional metrics/tracing tools if needed later
  - Managed adapter: CloudWatch or another managed observability and logging platform

## Recommended Documentation Rule

When introducing a new infrastructure dependency, document:

- what business need it supports;
- which port it implements;
- which local Docker service is used for development;
- which managed service can replace it in production.

## Related Documentation

- [Development Disciplines](../README.MD#development-disciplines)
- [Architecture Principles](../README.MD#architecture-principles)
- [Quality Attributes](../README.MD#quality-attributes)
- [Proof of Payment OCR/LLM Stack](./PROOF_OF_PAYMENT_OCR_LLM_STACK.MD)
- [Payout Gateway Port](./PAYOUT_GATEWAY_PORT.MD)
