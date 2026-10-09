# ADR-0003: AI is a constrained parser/advisor — domain services own decisions

- Status: Accepted
- Date: 2026-10-09

## Context

ServIQ uses LLMs for document parsing, bill/coin counting, and information retrieval. The
project's thesis is that AI output is probabilistic while business rules must be
deterministic and testable — mixing them would poison both.

## Decision

The AI Agent may only: parse documents/images, count bills and coins, and share
allowed/relevant information via tools and RAG. It never makes business decisions, never
mutates domain state directly, never touches a database, and never replies autonomously in
monitored workflows. Tools call domain APIs and propagate the caller's JWT; async flows use
service identity + on-behalf-of user ID.

## Alternatives considered

- AI-in-Billing parsing pipeline — couples a deterministic financial context to a
  probabilistic component; muddies ownership and testing.
- Agentic AI with broader autonomy — impressive demo, but demonstrates the opposite of the
  engineering discipline the portfolio is meant to show.

## Consequences

- AI mistakes degrade to manual-review flags, not wrong money movement — Billing validates.
- The AI Agent is swappable/discardable without touching domain logic.
- Testability stays clean: PHPSpec covers rules deterministically; AI quality is measured
  separately via an eval set.

See: `technical/ai/README.MD`, `AGENT_PROFILES.MD`, `PROOF_OF_PAYMENT_PARSING.MD`,
`CASH_REMITTANCE.MD`.
