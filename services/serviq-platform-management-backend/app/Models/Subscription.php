<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A tenant's subscription to a plan — the billing relationship Platform
 * Management owns. Status is the operational settlement state of that
 * relationship, not a payment record.
 */
class Subscription extends Model
{
    use HasUuid7;

    public const ACTIVE = 'active';
    public const PAST_DUE = 'past_due';
    public const CANCELED = 'canceled';

    public const STATUSES = [self::ACTIVE, self::PAST_DUE, self::CANCELED];

    protected $fillable = ['tenant_id', 'plan_id', 'status'];

    protected $attributes = ['status' => self::ACTIVE];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }
}
