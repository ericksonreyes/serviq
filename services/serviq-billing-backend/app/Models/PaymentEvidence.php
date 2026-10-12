<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

/**
 * AI-parsed proof of payment/remittance (BILLING.MD). The AI Agent
 * classifies + extracts; Billing validates, flags, and stores.
 */
class PaymentEvidence extends Model
{
    use HasUuid7;

    protected $table = 'payment_evidence';

    public const TYPES = [
        'E_WALLET', 'BANK_SLIP', 'REMITTANCE_RECEIPT', 'BANK_CHECK', 'POS_RECEIPT',
        'PURCHASE_ORDER', 'CASH_PHOTO', 'OTHER',
    ];

    /** Proof that collected cash was deposited — what a deposit batch accepts. */
    public const DEPOSIT_TYPES = ['BANK_SLIP', 'REMITTANCE_RECEIPT'];

    /** document_type → Payment.method. */
    public const METHOD_MAP = [
        'E_WALLET' => 'wallet',
        'BANK_SLIP' => 'bank',
        'REMITTANCE_RECEIPT' => 'bank',
        'BANK_CHECK' => 'bank',
        'POS_RECEIPT' => 'card',
        'PURCHASE_ORDER' => 'cash',
        'CASH_PHOTO' => 'cash',
        'OTHER' => 'cash',
    ];

    public const ACCEPTED = 'accepted';
    public const FLAGGED = 'flagged';
    public const REJECTED = 'rejected';

    protected $fillable = [
        'tenant_id', 'uploader_id', 'document_type', 'file_ref', 'raw_text',
        'extracted', 'claimed_reference', 'claimed_amount_cents',
        'confidence', 'status', 'flags', 'invoice_id',
        'reviewed_by', 'reviewed_at', 'review_notes',
    ];

    protected $casts = [
        'extracted' => 'array',
        'flags' => 'array',
        'confidence' => 'float',
        'reviewed_at' => 'datetime',
    ];
}
