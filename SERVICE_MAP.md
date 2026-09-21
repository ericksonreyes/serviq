# Service Map

This file lists the services in `services/` and acts as the canonical inventory for the code repositories in this workspace.

Each entry should use a simple per-service record with these fields:

- `name`
- `description`
- `location`
- `stack` (optional)

Stack policy is defined in [Service Stacks](workspace/specs/technical/SERVICE_STACKS.MD). In short:

- Command/write models use PostgreSQL.
- The Customer Portal uses a NestJS + MongoDB read model behind its BFF; internal services query their PostgreSQL command models directly for real-time data.
- Service Operations backends use Laravel with PHPSpec (TDD) and Behat (BDD) as the reference example for business-logic testing.

## Services

### Platform

- name: Platform Management Frontend
  description: Platform Management admin frontend
  location: services/serviq-platform-management-frontend/
  stack:
  - Flutter

- name: Platform Management Backend
  description: Platform Management command API
  location: services/serviq-platform-management-backend/
  stack:
  - FastAPI
  - PostgreSQL

- name: Identity & Access Frontend
  description: Identity & Access admin frontend
  location: services/serviq-identity-access-frontend/
  stack:
  - Flutter

- name: Identity & Access Backend
  description: Identity & Access command API and JWT issuer
  location: services/serviq-identity-access-backend/
  stack:
  - FastAPI
  - PostgreSQL

### Service Operations

- name: Service Management Frontend
  description: Service Management frontend application
  location: services/serviq-service-management-frontend/
  stack:
  - ReactJS
  - Bootstrap

- name: Service Management Backend
  description: Service Management command API
  location: services/serviq-service-management-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Customer & Request Management Frontend
  description: Customer & Request Management frontend application
  location: services/serviq-customer-request-management-frontend/
  stack:
  - ReactJS
  - Bootstrap

- name: Customer & Request Management Backend
  description: Customer & Request Management command API
  location: services/serviq-customer-request-management-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Service Job Management Frontend
  description: Service Job Management frontend application
  location: services/serviq-service-job-management-frontend/
  stack:
  - ReactJS
  - Bootstrap

- name: Service Job Management Backend
  description: Service Job Management command API
  location: services/serviq-service-job-management-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Workforce Management Frontend
  description: Workforce Management frontend application
  location: services/serviq-workforce-management-frontend/
  stack:
  - ReactJS
  - Bootstrap

- name: Workforce Management Backend
  description: Workforce Management command API
  location: services/serviq-workforce-management-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Assignment & Dispatch Frontend
  description: Assignment & Dispatch frontend application
  location: services/serviq-assignment-dispatch-frontend/
  stack:
  - ReactJS
  - Bootstrap

- name: Assignment & Dispatch Backend
  description: Assignment & Dispatch command API
  location: services/serviq-assignment-dispatch-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Field Service Execution Frontend
  description: Field Service Execution frontend application
  location: services/serviq-field-service-execution-frontend/
  stack:
  - ReactJS
  - Bootstrap

- name: Field Service Execution Backend
  description: Field Service Execution command API
  location: services/serviq-field-service-execution-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Notification Frontend
  description: Notification frontend application
  location: services/serviq-notification-frontend/
  stack:
  - ReactJS
  - Bootstrap

- name: Notification Backend
  description: Notification command API
  location: services/serviq-notification-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

### Customer Portal

- name: Customer Portal Frontend
  description: Customer Portal frontend application
  location: services/serviq-customer-portal-frontend/
  stack:
  - ReactJS
  - Material UI

- name: Customer Portal Backend
  description: Customer Portal BFF and CQRS read model API; proxies commands to Service Operations
  location: services/serviq-customer-portal-backend/
  stack:
  - NestJS
  - MongoDB

### Finance & Accounting

- name: Billing Frontend
  description: Billing frontend application
  location: services/serviq-billing-frontend/
  stack:
  - NuxtJS
  - Bootstrap

- name: Billing Backend
  description: Billing command API
  location: services/serviq-billing-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat

- name: Payouts Frontend
  description: Payouts frontend application
  location: services/serviq-payouts-frontend/
  stack:
  - NuxtJS
  - Bootstrap

- name: Payouts Backend
  description: Payouts command API
  location: services/serviq-payouts-backend/
  stack:
  - Laravel
  - PostgreSQL
  - PHPSpec
  - Behat
