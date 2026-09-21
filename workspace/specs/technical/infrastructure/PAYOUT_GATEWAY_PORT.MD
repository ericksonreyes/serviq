# Payout Gateway Port

This document defines the Hexagonal Architecture port contract used by the Payouts context to execute payout transfers.

The Payouts domain owns payout intent, payout scheduling, and payout lifecycle. This document defines the technical contract that a concrete adapter must implement.

## Goals

- Keep payout execution behind a port interface.
- Allow a fake gateway in Docker for local development.
- Support success, failure, pending, and canceled outcomes.
- Keep production providers replaceable without changing business logic.
- Avoid native installs in local development.

## Port Contract

The application layer should depend on a payout gateway port rather than a specific provider SDK.

Minimum operations:

- `CreatePayout`
- `GetPayout`
- `CancelPayout`

### Suggested interface shape

```text
PayoutGatewayPort
    CreatePayout(request) -> PayoutResult
    GetPayout(payoutId) -> PayoutResult
    CancelPayout(payoutId) -> PayoutResult
```

### CreatePayout

Creates a payout request against the gateway.

Required request fields should include:

- Tenant identifier
- Payout amount
- Currency
- Destination reference
- External reference or idempotency key
- Metadata for traceability

Expected result fields should include:

- Gateway payout identifier
- Payout status
- Created timestamp
- Processed timestamp, when available
- Failure code and failure message, when failed

### GetPayout

Returns the latest known state for a payout request.

### CancelPayout

Cancels a payout when the provider supports cancellation before settlement.

## Data Model

Recommended payout states:

- `pending`
- `succeeded`
- `failed`
- `canceled`

Recommended failure reasons:

- `validation_error`
- `invalid_destination`
- `insufficient_funds`
- `provider_unavailable`
- `duplicate_request`

## Fake Local Adapter

The fake payout gateway is the local concrete implementation of this port.

It should:

- run in Docker
- keep deterministic behavior for tests
- store or replay payout state locally
- simulate both successful and failed outcomes
- avoid any external network dependency

A local test suite should be able to force outcomes by scenario data or seed fixtures so the same payout request can be reproduced consistently.

The fake adapter should implement the same port contract as the managed provider adapter, so the application code does not know which implementation it is using.

## Managed Adapter Comparison

Managed production adapters may be implemented with a bank transfer API or another payout provider.

The production adapter should implement the same `CreatePayout`, `GetPayout`, and `CancelPayout` contract so it can replace the fake adapter without changing the Payouts domain logic.

## Optional Webhook Support

Some payout providers support asynchronous status callbacks (webhooks). When that capability exists, the adapter may expose an inbound webhook handler that translates provider events into payout status updates.

If the provider does not support webhooks, the adapter may omit the callback handler and rely on:

- `GetPayout` polling
- scheduled reconciliation
- provider response state at creation time

Webhook support is therefore optional for the adapter, but payout status tracking remains required.

### Payout Status Webhook

The inbound webhook handler should be treated as a separate adapter boundary from the outbound payout port.

Suggested handler shape:

```text
PayoutStatusWebhookHandler
    HandleWebhook(request) -> WebhookResult
```

Expected webhook fields should include:

- Provider name
- Event identifier
- Event type
- Event timestamp
- Payout identifier
- Payout status
- Failure code, when failed
- Failure message, when failed
- Signature or verification metadata
- Raw payload reference for audit tracing

The handler should validate the provider event, map it to the internal payout state model, and ignore duplicate events when the event identifier has already been processed.

## Integration Notes

- The Payouts context should depend on the port, not the adapter.
- Business rules such as payout amount calculation remain in the Payouts domain.
- The gateway adapter only performs execution and state reporting.
- Manual review, exception handling, and reconciliation remain separate finance concerns.
