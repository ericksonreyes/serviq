# Agent Profiles

This document defines the agent profile model and the starter profiles: the Customer, Dispatcher, and Customer Support chatbots.

## Profile Model

A profile is a named configuration that turns the shared agent codebase into a context-scoped assistant:

- **System prompt** — persona and behavioral rules for that context.
- **Tool registry** — the exact set of tools the agent may call.
- **Context binding** — which channel and bounded context the profile serves.

Profile isolation is a hard boundary: a tool not registered to a profile does not exist for that agent. Profiles must never share a tool, even when two capabilities look similar — each profile gets its own tool with its own permission checks.

How many deployments run is an open operational decision; the profiles and their isolation apply either way.

## Customer Chatbot

Serves the **Customer** persona through the Customer Portal channel.

| Tool | Capability | Owning context |
| --- | --- | --- |
| `service_availability` | Check whether a service can be scheduled tomorrow, on a given date, or in a date range | Service Management |
| `service_request_status` | Look up the status of the caller's Service Request | Customer & Request Management |
| `service_request_create` | Create a new Service Request | Customer & Request Management |
| `complaint_file` | File a complaint or support case | Customer Support (interim: Customer & Request Management) |
| `proof_of_payment_upload` | Submit payment evidence for parsing and storage | Billing (via AI Agent parsing) |
| `refund_request` | Request a refund | Billing |
| `service_request_cancel` | Cancel a Service Request | Customer & Request Management |

Rules:

- Cancellation is policy-gated: the tool calls Customer & Request Management, which evaluates the cancellation policy and may refuse. The agent does not decide eligibility.
- All tools operate only on the caller's own data — enforced by the propagated JWT's identity and tenant claims.
- `proof_of_payment_upload` routes uploads through [Proof of Payment Parsing](./PROOF_OF_PAYMENT_PARSING.MD); each profile that needs it registers its own tool variant.

## Dispatcher Chatbot

Serves the **Dispatcher** persona inside a tenant.

| Tool | Capability | Owning context |
| --- | --- | --- |
| `service_request_search` | Search Service Requests across the tenant's queue | Customer & Request Management |
| `service_agent_search` | Search Service Agents by skill, availability, or service area | Workforce Management |
| `repair_guide_search` | Search trusted troubleshooting and repair guides (RAG over the vector search port) | AI Agent (vector store) |
| `dispatch_recommend` | Produce top-N agent recommendations for a job, with reasons | Assignment & Dispatch |
| `cash_turnin_count` | Count photographed bills and coins during a cash turn-in and submit the count to Billing | Billing |
| `remittance_evidence_upload` | Submit Service Agent revenue-remittance evidence for parsing and storage | Billing (via AI Agent parsing) |

Rules:

- `repair_guide_search` reads only curated, ingested documents — the agent never searches the internet for repair content.
- `dispatch_recommend` is advisory only: it ranks candidates and explains why; the dispatcher approves, and Assignment & Dispatch performs the actual assignment.
- `remittance_evidence_upload` is this profile's own variant of payment-evidence intake — it is not shared with the Customer profile's `proof_of_payment_upload`.

## Customer Support Chatbot

Serves the **Customer Support** role inside a tenant — case handlers and refund reviewers.

| Tool | Capability | Owning context |
| --- | --- | --- |
| `complaint_manage` | List, review, escalate, and resolve complaints and support cases | Customer Support (interim: Customer & Request Management) |
| `refund_process` | Execute an approved refund payment | Billing |
| `refund_manage` | List, review, approve, or reject refund cases | Customer Support |

Rules:

- Refund *decisions* (approve/reject) are recorded by Customer Support; Billing only executes the approved refund payment.
- `refund_process` is permission-gated — the caller's JWT must carry the refund permission for their tenant.
- `complaint_manage` targets Customer & Request Management only as the documented interim owner until a Customer Support service exists — see the [Customer Support boundary](../../domain/specs/domain_boundaries/service_operations/CUSTOMER_SUPPORT.MD).

### Command bar input

The dispatcher profile also powers a **natural-language command box** in the dispatcher UI — a power-user shortcut, not a chat transcript.

```text
Dispatcher types "find me available service agents tomorrow"
        │
        ▼
Agent translates prompt → constrained JSON on the tool whitelist
        │
        ▼
{ "tool": "service_agent_search", "params": { "status": "available", "date": "2026-10-10" } }
        │
        ▼
Tool executes via Workforce Management API → results update the UI grid/map
```

Rules:

- The model translates prompts into **registered tool calls only** — a strict JSON schema, current server date injected, no free-form query generation, ever.
- Unmappable prompts are rejected with a hint, not improvised.
- Results render as UI state (filtered grids, highlighted map pins), not chat bubbles.

## Tool Isolation Summary

```text
Customer profile              Dispatcher profile            Customer Support profile
        │                             │                              │
        ├── service_availability      ├── service_request_search     ├── complaint_manage
        ├── service_request_status    ├── service_agent_search       ├── refund_process
        ├── service_request_create    ├── repair_guide_search        └── refund_manage
        ├── complaint_file            ├── dispatch_recommend
        ├── refund_request            ├── cash_turnin_count
        ├── service_request_cancel    └── remittance_evidence_upload
        └── proof_of_payment_upload
```

If a capability is needed on more than one side, register a distinct tool per profile — never expose one tool to
multiple profiles. `proof_of_payment_upload` (Customer) and `remittance_evidence_upload` (Dispatcher) are the
canonical example: same parsing pipeline, separate tools, separate permissions.

## Background and Advisory Capabilities

Not every AI capability is conversational. These run without a chat UI and follow the same rules: constrained output, API-call-only tools, human decides.

- **Voice report extraction** (Service Agent context) — a field agent's voice note is transcribed locally (audio-to-text port), then Ollama parses it into constrained JSON (`labor_hours`, `parts_used`, notes). The result is submitted to Field Service Execution via API; the service deducts stock and Billing computes charges. The LLM never touches the database or the invoice.
- **Chat sentiment triage** (Customer context) — each inbound customer chat message is scored by a fast local model. `URGENT`/`ANGRY` flags are pushed to the dispatcher UI (the row flashes) so a human calls the customer. The AI never replies on the customer's behalf.
- **Dispatch recommendations** — covered by the `dispatch_recommend` tool above; ranking and reasoning are advisory, the dispatcher approves.

## Related Documentation

- [AI Agent](./README.MD) — architecture and security rules
- [Proof of Payment Parsing](./PROOF_OF_PAYMENT_PARSING.MD)
- [Domain Boundaries](../../domain/specs/DOMAIN_BOUNDARIES.md)
- [Billing](../../domain/specs/domain_boundaries/finance/BILLING.MD)
- [Customer & Request Management](../../domain/specs/domain_boundaries/service_operations/CUSTOMER_REQUEST_MANAGEMENT.MD)
