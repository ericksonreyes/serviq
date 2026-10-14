# ADR-0025: Server-side availability gate on request creation

- Status: Accepted
- Date: 2026-10-14

## Context

The customer portal's booking page already gates its pickers on Service
Management's `GET /services/{id}/availability` — the calendar only enables
bookable dates and start times come pre-flagged against agent shifts. But
that was a UI gate only: `ServiceRequestController::store` re-validated
coverage server-side (ADR-0023) yet accepted any `scheduled_for` value, so
a direct API call could book a declared closure, a holiday, a Sunday, or a
start time no agent's shift covers.

## Decision

`store` now runs an **availability gate** after the coverage gate, via a
synchronous `AvailabilityGate` probe to the same availability endpoint —
the caller's JWT forwards verbatim, matching `CoverageGate`:

- Only applies when the request carries both `service_id` and a date
  (`scheduled_for` or `preferred_date`) — open-ended requests have nothing
  to check.
- A date absent from the day's `days` payload (closure, holiday, no
  capacity, or beyond the 92-day horizon) → `422 outside_availability`.
- A time is bookable when it's in the day's `times` (starts at the job's
  cadence) **or** its hour's `hours[]` flag is `available` — the same
  flags that drive the portal's time chips, so the gate accepts exactly
  what the UI offers; for starts not on the hour the containing hour's
  flag is the shift-coverage proxy and the job must still end inside the
  window. The 422 echoes `bookable_times` so callers can re-pick without
  another round trip.
- Probe unreachable → `503 availability_unavailable`, fail-closed like
  coverage — a booking we cannot verify does not get created.

For the customer-facing side, Service Management gains
`GET /tenants/{t}/operations` — weekly `hours`, upcoming `closures`
(one-off dates + next occurrence of recurring MM-DD holidays), and
`cancellation_policy` — deliberately omitting capacity internals (crews,
agent shifts); customers see the effect through slot availability, not the
roster.

## Consequences

- `scheduled_for` is now a verified invariant, not a hint — off-window
  submissions are rejected regardless of client.
- The operations summary turns previously write-only settings
  (`cancellation_policy`) into customer-visible information and lets the
  calendar distinguish "closed" from "unavailable".
- Same coupling trade-off as ADR-0023: CRM depends on Service Management
  being up for request creation; both probes are short-timeout and the
  failure is explicit (503), not a silent accept.
