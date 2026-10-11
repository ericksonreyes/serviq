# Proof of Payment Parsing

This document describes the AI Agent's ability to accept payment and remittance evidence from chat and parse it into structured fields for storage.

## Accepted Inputs

The agent accepts payment evidence in conversational uploads, across both digital and physical payment channels:

- **E-wallet digital receipt** — screenshot or exported image of a wallet transaction (e.g. GCash).
- **Remittance-center receipt** — paper receipt photographed by the user.
- **Photo of bills and coins** — physical cash laid out and photographed.
- **Bank deposit slip** — machine-stamped over-the-counter deposit slips; layouts vary by bank and ink can be faint.
- **Physical check** — photographed paper check handed to a dispatcher or field agent.
- **POS terminal receipt** — small thermal-paper card receipts; often faded, folded, or smudged.
- **Purchase order** — corporate PO documents with tables, terms, and signatures, used for net-30/net-60 B2B work.

## Polymorphic Parsing Strategy

One unified capability — not one pipeline per document type. The vision model first classifies the upload, then extracts the fields for that document type:

```text
Upload
  │
  ▼
Vision LLM: classify document_type
  │   E_WALLET | BANK_SLIP | BANK_CHECK | POS_RECEIPT | PURCHASE_ORDER | CASH_PHOTO
  ▼
Extract fields matching that document's schema
  │
  ▼
{ "document_type": "...", "reference_id": "...", "amount": 0.0, "metadata": { ... } }
  │
  ▼
Tool call → Billing API stores the evidence and applies business rules
```

## Per-Type Extraction

| Document type | Fields extracted | Guardrail applied by Billing |
| --- | --- | --- |
| `E_WALLET` | Reference number, amount, channel | Duplicate reference check |
| `BANK_SLIP` | Bank name, account stamp, date/time, deposited amount, reference number | Duplicate reference check across payments and remittance batches; may close a cash remittance batch on dispatcher confirmation — bank-ledger verification is out of scope |
| `BANK_CHECK` | MICR line, payee, numeric amount, written amount, signature present | Numeric-vs-written amount mismatch flagged; unsigned checks rejected; stays `Pending Clearing` |
| `POS_RECEIPT` | Card scheme, masked card number, auth code, merchant ID | Auth-code reuse check — yesterday's receipt can't pay today's job |
| `PURCHASE_ORDER` | PO number, billing terms, authorized signatures, itemized SKUs | Creates accounts-receivable entry; updates corporate credit balance |
| `CASH_PHOTO` | Denomination breakdown, counted total | Variance check against expected remittance — see [Cash Remittance Counting](./CASH_REMITTANCE.MD) |

## Example

1. A customer or Service Agent uploads a GCash payment photo in chat.
2. The agent classifies it as `E_WALLET`, extracts the reference number, amount, and related fields.
3. The agent calls the Billing API with the extracted data — as proof of customer payment or proof of revenue remittance.
4. Billing checks whether the reference number was used before and flags the record as **duplicated** — a fraud guard.
5. Billing checks whether the amount is under-remitted and flags the record as **under-remitted**.
6. Flagged records route to a human for reconciliation.

## Rules

- **The agent has no database access.** It cannot read or write PostgreSQL or any service datastore — everything goes through an API call to the concerned microservice.
- The agent classifies and extracts only. Duplicate detection, amount verification, clearing decisions, AR entries, confidence scoring, flagging, and settlement all belong to the responsible microservice. This separation is intentional: it keeps humans in the loop for reconciliation and operational compliance instead of letting the AI mark anything as verified or settled.
- Layout-variant and degraded inputs (faint deposit slips, crinkled thermal receipts, handwritten checks) are exactly where a Vision LLM outperforms line-by-line OCR — see [Proof of Payment OCR/LLM Stack](../infrastructure/PROOF_OF_PAYMENT_OCR_LLM_STACK.MD).
- The agent must not invent values not visible in the evidence; unparseable or low-confidence uploads go to manual review rather than being guessed.

## Related Documentation

- [AI Agent](./README.MD) — architecture and capability rules
- [Agent Profiles](./AGENT_PROFILES.MD) — which profiles expose this tool
- [Cash Remittance Counting](./CASH_REMITTANCE.MD) — the cash turn-in flow built on `CASH_PHOTO` parsing
- [Billing — Proof of Payment Intake](../../domain/specs/domain_boundaries/finance/BILLING.MD)
- [Proof of Payment OCR/LLM Stack](../infrastructure/PROOF_OF_PAYMENT_OCR_LLM_STACK.MD)
