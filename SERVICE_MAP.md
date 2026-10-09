# Service Map

This file lists the services in `services/` and acts as the canonical inventory for the code repositories in this workspace.

Each entry should use a simple per-service record with these fields:

- `name`
- `description`
- `location`
- `stack` (optional)

Stack policy is defined in [Service Stacks](workspace/specs/technical/SERVICE_STACKS.MD). In short:

- Frontends use a single React (Vite) stack, shipped as static builds — one app per user channel.
- Command/write models use PostgreSQL.
- The Customer Portal uses a NestJS + MongoDB read model behind its BFF; internal services query their PostgreSQL command models directly for real-time data.
- Service Operations backends use Laravel with PHPSpec (TDD) and Behat (BDD) as the reference example for business-logic testing.

Layout policy: **one deployable frontend per user channel, one backend service per bounded context**, all as
monorepo folders under `services/`.

## Services

### Channels (frontends)

- name: Customer Portal Frontend
  description: Customer-facing app — signup, browsing, booking, tracking, self-service
  location: services/serviq-customer-portal-frontend/
  stack:
  - ReactJS
  - Material UI

- name: Service Agent Frontend
  description: Field agent app — assignments, job steps, evidence upload, cash turn-in
  location: services/serviq-service-agent-frontend/
  stack:
  - ReactJS (PWA)
  - Material UI

- name: Tenant Console Frontend
  description: Internal console for tenant staff — admin, dispatch, customer support, service ops, and finance views
  location: services/serviq-tenant-console-frontend/
  stack:
  - ReactJS (Vite)
  - Tailwind CSS

- name: Platform Admin Frontend
  description: Internal console for platform operators — tenant lifecycle, plans, IAM administration
  location: services/serviq-platform-admin-frontend/
  stack:
  - ReactJS (Vite)
  - Tailwind CSS

### Platform

- name: Platform Management Backend
  description: Platform Management command API — tenants, subscriptions, plans, feature flags
  location: services/serviq-platform-management-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Identity & Access Backend
  description: Identity & Access command API and sole JWT issuer — users, roles, tenant scopes
  location: services/serviq-identity-access-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

### Service Operations

- name: Service Management Backend
  description: Service Management command API — service catalog and workflow templates
  location: services/serviq-service-management-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Customer & Request Management Backend
  description: Customer & Request Management command API — customers, service requests
  location: services/serviq-customer-request-management-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Service Job Management Backend
  description: Service Job Management command API — job lifecycle and workflow instances (event-sourced)
  location: services/serviq-service-job-management-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Workforce Management Backend
  description: Workforce Management command API — agent skills, availability, service areas
  location: services/serviq-workforce-management-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Assignment & Dispatch Backend
  description: Assignment & Dispatch command API — assignment engine, offers, strategies
  location: services/serviq-assignment-dispatch-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Field Service Execution Backend
  description: Field Service Execution command API — check-ins, step evidence, completion
  location: services/serviq-field-service-execution-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Customer Support Backend
  description: Customer Support command API — cases, complaints, escalations, refund decisions
  location: services/serviq-customer-support-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Notification Backend
  description: Notification command API — channels, routing rules, templates
  location: services/serviq-notification-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

### Edges (BFFs)

- name: Customer Portal BFF
  description: Customer Portal Backend For Frontend — CQRS read model API; proxies customer commands to domain services
  location: services/serviq-customer-portal-bff/
  stack:
  - NestJS
  - MongoDB

- name: Service Agent BFF
  description: Service Agent Backend For Frontend — aggregates job/assignment/evidence views and proxies agent commands; no read model, queries command APIs in real time
  location: services/serviq-service-agent-bff/
  stack:
  - NestJS

### Finance & Accounting

- name: Billing Backend
  description: Billing command API — invoices, payment evidence, remittance reconciliation (event-sourced)
  location: services/serviq-billing-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Payouts Backend
  description: Payouts command API — fund distribution, payout lifecycle, shortfall deductions (event-sourced)
  location: services/serviq-payouts-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

### AI

- name: AI Agent
  description: Constrained AI service — document parsing, cash counting, RAG, advisory tools (Customer / Dispatcher / Customer Support profiles)
  location: services/serviq-ai-agent/
  stack:
  - Python
  - FastAPI
  - Ollama
  - pgvector