<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class Remittance extends Model
{
    use HasUuid7;

    protected $fillable = [
        'tenant_id', 'kind', 'agent_id', 'reference', 'status', 'total_cents',
        'expected_cents', 'counted_cents', 'variance_cents', 'evidence_id',
        'flags', 'decision', 'decision_notes', 'confirmed_by', 'overridden_by',
    ];

    protected $casts = ['flags' => 'array'];

    /** turn_in: agent→dispatcher cash; deposit_batch: dispatcher→bank slip; digital: validated e-payments. */
    public const TURN_IN = 'turn_in';
    public const DEPOSIT_BATCH = 'deposit_batch';
    public const DIGITAL = 'digital';

    public const PENDING = 'pending_confirmation';
    public const MANUAL_REVIEW = 'manual_review';
    public const REMITTED = 'remitted';
    public const REJECTED = 'rejected';
}
