"""Document contract — the polymorphic auditor's type vocabulary
(ADR-0003 boundary). Shared by the parse pipeline (app.parser) and the
stub provider adapter (app.providers.stub) so neither has to import the
other.
"""

DOCUMENT_TYPES = [
    "e_wallet_receipt", "cash_photo", "bank_deposit_slip", "remittance_receipt",
    "check", "pos_receipt", "purchase_order", "unknown",
]

SCHEMA_HINTS = {
    "e_wallet_receipt": ["reference_no", "amount", "currency", "sender", "provider",
                         "recipient_name", "recipient_account"],
    "cash_photo": ["denominations", "total_amount", "currency"],
    "bank_deposit_slip": ["bank", "recipient_name", "recipient_account", "amount",
                          "deposit_date", "reference_no"],
    "remittance_receipt": ["provider", "recipient_name", "amount", "date", "reference_no"],
    "check": ["check_no", "amount", "bank", "date"],
    "pos_receipt": ["merchant", "amount", "date", "card_last4"],
    "purchase_order": ["po_number", "vendor", "total_amount", "date"],
}
