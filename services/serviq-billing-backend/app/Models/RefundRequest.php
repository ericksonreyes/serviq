<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class RefundRequest extends Model
{
    use HasUuid7;

    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const EXECUTED = 'executed';
    public const REJECTED = 'rejected';

    protected $fillable = [
        'tenant_id', 'invoice_id', 'status', 'reason', 'requested_by',
        'decision_id', 'approved_by', 'executed_by', 'executed_at',
    ];

    protected $casts = ['executed_at' => 'datetime'];
}
