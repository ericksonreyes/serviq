<?php

namespace App\Models;

use App\Domain\Tenancy\TenantLifecycle;
use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use RuntimeException;

/**
 * The Tenant entity — Platform Management is its system of record
 * (ADR-0002). Lifecycle transitions are guarded: the first valid writer
 * wins, illegal transitions are rejected, never silently applied.
 */
class Tenant extends Model
{
    use HasUuid7;

    protected $fillable = ['name', 'slug', 'status', 'plan_id'];

    protected $attributes = ['status' => TenantLifecycle::PENDING];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function subscription(): HasOne
    {
        return $this->hasOne(Subscription::class);
    }

    public function isActive(): bool
    {
        return $this->status === TenantLifecycle::ACTIVE;
    }

    /**
     * Conditional state transition — UPDATE ... WHERE status IN (allowed
     * sources), so a stale or illegal transition can never corrupt state.
     */
    public function transitionTo(string $to): bool
    {
        $lifecycle = new TenantLifecycle();
        if (! $lifecycle->canTransition($this->status, $to)) {
            throw new RuntimeException("Illegal tenant transition: {$this->status} → {$to}");
        }

        $updated = static::where('id', $this->id)
            ->whereIn('status', $lifecycle->sourcesFor($to))
            ->update(['status' => $to]);
        $this->refresh();

        return $updated > 0;
    }
}
