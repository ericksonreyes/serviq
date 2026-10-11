# Infrastructure & Local Development

This document describes how ServIQ should be run locally and how infrastructure dependencies should be modeled so they can be swapped between self-managed and managed services.

## Goals

- Keep local development reproducible and easy to start.
- **Run the whole system in Docker simultaneously** — every service and dependency, all at once, is the proof-of-concept target.
- Avoid native installs in local development; every local dependency must be runnable in Docker.
- Production deployment is not a current concern; managed/cloud adapters are documented swap targets only, to prove the port boundary works.
- Use the same domain-facing interfaces regardless of whether a service is local, self-managed, or cloud-managed.
- Make infrastructure changes possible without rewriting business logic.
- Keep local logs grouped by app and searchable by keyword during development.

## Local Development Approach

For local testing, run all supporting services in Docker containers rather than depending on native installs or external cloud services.

### Suggested local services

- **RabbitMQ** — message broker for asynchronous work and event delivery, used as a local replacement for services such as SQS and SNS.
- **PostgreSQL** — local relational store for command/write models, used as a replacement for managed relational databases such as Amazon RDS or Aurora.
- **MongoDB** — local document store for CQRS read models, used as a replacement option for managed document storage such as Amazon DocumentDB or DynamoDB.
- **Redis** — shared store for the JWT token blacklist used for pre-expiry invalidation.
- **Ollama** — local LLM inference for the AI Agent service, used as a replacement for managed LLM services such as Amazon Bedrock.
- **Fluent Bit** — log collection from Docker containers. Local output is stdout (minimal footprint); the observability port keeps a searchable sink (OpenSearch, Loki, or managed logging) swappable via adapter — see `LOCAL_RESOURCE_BUDGET.MD`.

Services should emit structured JSON logs with fields such as `app`, `service`, `environment`, `level`, `message`, `requestId`, `traceId`, and `timestamp` so logs can be grouped and searched by application.

The exact local stack can evolve over time, but the goal is always the same: developers should be able to run the system end-to-end without needing production cloud infrastructure.

### Local resource budget

The target is the full system running simultaneously in Docker. On constrained machines (the 8GB MacBook Air
reference), tiered profiles are a fallback lever — not the goal — for when memory pressure appears:

- **infra** — datastores, broker, cache, and logging only
- **domain** — infra plus the Laravel services being worked on
- **ai** — infra plus Ollama and the AI Agent (vision models consume the largest share; see the [OCR/LLM stack](./PROOF_OF_PAYMENT_OCR_LLM_STACK.MD) sizing notes)

The full memory and disk budgets — per-service allocations, image tag choices, and model-weight discipline — are in [Local Resource Budget](./LOCAL_RESOURCE_BUDGET.MD).

For immediate testing, the install seeds demo accounts for every role — the credential table is in the [root README](../../../../README.MD#local-seed-accounts) and the seeding mechanics in [Local Development](./LOCAL_DEVELOPMENT.MD).

Package downloads are cached in shared named volumes (`serviq-composer-cache`,
`serviq-npm-cache`) — the installed `vendor/`/`node_modules/` trees stay
per-service on the host; only the download cache is shared.

## Hexagonal Architecture Fit

ServIQ should depend on **ports** for external capabilities and use **adapters** for concrete implementations.

That means:

- the application code talks to abstractions, not vendor-specific services;
- local Docker services implement one set of adapters;
- managed cloud services implement another set of adapters;
- switching from self-managed to paid managed services should be an infrastructure change, not a domain change.

### Infrastructure configuration policy

- Machine-specific infrastructure config and credentials must be untracked or ignored by git (e.g. `.env`, local overrides — keep only `*.dist` templates).
- Shared stack definitions that contain no secrets, such as [`services/docker-compose.yml`](../../../../services/docker-compose.yml), are tracked so every developer runs the identical local stack.
- Every directory under `services/` must contain a committed `.env.example` (or `.env.dist` where the framework's own convention prefers it) preconfigured for the Docker network — values reference compose service names (`postgres`, `redis`, `rabbitmq`, `mongo`, `minio`, `ollama`), never `localhost`. Exception: frontend `VITE_*` values use `localhost` host-mapped ports because the browser cannot resolve compose DNS. [`scripts/install.sh`](../../../../scripts/install.sh) copies each template to `.env` and brings the stack up in dependency order (infra → domain → AI → frontends). Templates contain safe local defaults only, never real secrets.
- CI/CD should supply the runtime dependencies and final configuration so deployed infrastructure remains the source of truth.

## Example Port and Adapter Areas

- **Messaging port**
  - Local adapter: RabbitMQ — topology, outbox, retries, and consumer containers are specified in [`EVENT_DELIVERY.MD`](./EVENT_DELIVERY.MD)
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
  - Local adapter: Fluent Bit shipping container logs to stdout (minimal footprint); an optional searchable sink (OpenSearch/Loki) can be enabled if needed
  - Managed adapter: CloudWatch or another managed observability and logging platform
- **LLM inference port**
  - Local adapter: Ollama — the model itself is configuration (`OLLAMA_*_MODEL` env vars), not architecture; better hardware unlocks bigger models through the same adapter. Default sizing for the 8GB reference machine is in [`LOCAL_RESOURCE_BUDGET.MD`](./LOCAL_RESOURCE_BUDGET.MD)
  - Managed adapter: Amazon Bedrock or another managed LLM service
- **Audio transcription port**
  - Local adapter: a local speech-to-text engine such as Whisper (whisper.cpp)
  - Managed adapter: Amazon Transcribe or another managed speech-to-text service
- **Document and photo parsing port**
  - Local adapter: vision model via Ollama — `moondream` by default (resource-budgeted), `qwen2.5vl` when hardware allows (better on dense e-wallet screenshots); PaddleOCR → text-LLM is the documented last-resort pipeline
  - Managed adapter: Amazon Textract or a managed vision model
- **Vector search port**
  - Local adapter: pgvector — PostgreSQL extension, reuses the existing datastore container
  - Managed adapter: Amazon RDS/Aurora PostgreSQL with pgvector, or a managed vector database
- **Object storage port**
  - Local adapter: MinIO in Docker
  - Managed adapter: Amazon S3 or another managed object store
  - Backs all file uploads: proof-of-payment images, field photos, customer signatures, purchase-order documents, remittance evidence. Services store the object key/reference in PostgreSQL; files never live in the relational store.
- **Real-time delivery port**
  - Local adapter: a WebSocket gateway over Redis pub/sub (or a hub such as Mercure or Soketi in Docker)
  - Managed adapter: AWS API Gateway WebSocket or a managed pub/sub service such as Pusher or Ably
  - Backs server-pushed UI updates: broadcast assignment offers and their expiry, dispatcher sentiment flags, live job tracking

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
- [Local Development](./LOCAL_DEVELOPMENT.MD)
- [Event Delivery](./EVENT_DELIVERY.MD)
- [Proof of Payment OCR/LLM Stack](./PROOF_OF_PAYMENT_OCR_LLM_STACK.MD)
- [Payout Gateway Port](./PAYOUT_GATEWAY_PORT.MD)
