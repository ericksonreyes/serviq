<?php

namespace App\Events\Handlers;

use App\Models\ProjectedPlanFeatures;
use Illuminate\Support\Facades\Log;

/**
 * Platform.TenantCreated / Platform.SubscriptionAssigned → plan-features
 * projection. Events carry the resolved plan (code + features) — the
 * handler just mirrors the latest state for the tenant. A null plan
 * (tenant created without one) writes nothing; enforcement stays
 * fail-open until a subscription lands.
 */
class PlanFeaturesHandler
{
    public function handle(array $envelope): void
    {
        $p = $envelope['payload'] ?? [];
        $tenantId = $p['tenant_id'] ?? $envelope['tenant_id'] ?? null;
        if ($tenantId === null) {
            throw new \RuntimeException($envelope['type'].' missing tenant_id');
        }

        $plan = $p['plan'] ?? null;
        if ($plan === null) {
            return;
        }

        ProjectedPlanFeatures::updateOrCreate(
            ['tenant_id' => $tenantId],
            [
                'plan_code' => $plan['code'] ?? null,
                'features' => $plan['features'] ?? null,
                'status' => $p['status'] ?? 'active',
            ],
        );

        Log::info("Plan features projected: {$tenantId} → {$plan['code']}");
    }
}
