<?php

namespace App\Http\Controllers;

use App\Models\Subscription;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;

/**
 * Operational income report — what the platform stands to bill tenants in
 * subscription fees, aggregated from this service's own plan/subscription
 * records. Settlement status is derived from the subscription status; it
 * is not payment-ledger data (Billing owns tenant→customer money).
 */
class IncomeReportController
{
    /**
     * Maps subscription status onto the settlement column the console
     * shows. 'current' means the subscription fee is being accrued as
     * expected; tenants with a plan but no subscription row are reported
     * as 'untracked' rather than silently dropped.
     */
    private const SETTLEMENT = [
        Subscription::ACTIVE => 'current',
        Subscription::PAST_DUE => 'past_due',
        Subscription::CANCELED => 'canceled',
        null => 'untracked',
    ];

    public function income(): JsonResponse
    {
        $rows = [];
        $totals = [];

        Tenant::with(['plan', 'subscription.plan'])
            ->orderBy('name')
            ->chunk(100, function ($tenants) use (&$rows, &$totals) {
                foreach ($tenants as $tenant) {
                    $subscription = $tenant->subscription;
                    $plan = $subscription?->plan ?? $tenant->plan;
                    $status = $subscription?->status;

                    $rows[] = [
                        'tenant_id' => $tenant->id,
                        'name' => $tenant->name,
                        'slug' => $tenant->slug,
                        'tenant_status' => $tenant->status,
                        'plan_code' => $plan?->code,
                        'plan_name' => $plan?->name,
                        'price_cents' => $plan?->price_cents,
                        'currency' => $plan?->currency,
                        'subscription_status' => $status,
                        'settlement_status' => self::SETTLEMENT[$status] ?? 'untracked',
                    ];

                    if ($plan !== null) {
                        $bucket = $totals[$plan->currency] ??= [
                            'currency' => $plan->currency,
                            'subscribed_tenants' => 0,
                            'income_cents' => 0,
                            'past_due_cents' => 0,
                        ];
                        $bucket['subscribed_tenants']++;
                        if ($status === Subscription::ACTIVE) {
                            $bucket['income_cents'] += $plan->price_cents;
                        } elseif ($status === Subscription::PAST_DUE) {
                            $bucket['past_due_cents'] += $plan->price_cents;
                        }
                        $totals[$plan->currency] = $bucket;
                    }
                }
            });

        return response()->json([
            'data' => [
                'basis' => 'operational',
                'tenants' => $rows,
                'totals' => array_values($totals),
            ],
        ]);
    }
}
