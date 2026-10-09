# ADR-0013: pgvector as the local vector-search adapter

- Status: Accepted
- Date: 2026-10-09

## Context

RAG for the AI Agent needs vector storage. The budget already carries PostgreSQL; a dedicated
vector DB (Qdrant, Weaviate, Milvus, OpenSearch-as-vector-store) adds a whole container for a
POC-scale corpus.

## Decision

pgvector inside the shared PostgreSQL instance (`pgvector/pgvector:pg17` image — extension
preinstalled). One `serviq_ai` schema/database for embeddings, behind the vector-search port.

## Alternatives considered

- Dedicated vector DB — overkill for a demo corpus; another container against the RAM budget.
- OpenSearch k-NN — requires running OpenSearch, which was dropped from the always-on set
  (ADR-0014).

## Consequences

- Zero additional infrastructure — vector search rides the datastore that's already there.
- Migration path to a managed/dedicated store stays a pure adapter swap (RDS pgvector or a
  managed vector DB).
- At POC scale (thousands of chunks) pgvector latency is indistinguishable from dedicated
  stores.

See: `technical/infrastructure/README.MD` (Vector search port).
