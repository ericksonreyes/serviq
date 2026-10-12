<?php

namespace App\Http\Controllers;

use App\Models\Subscription;
use App\Models\Tenant;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SubscriptionController
{
    public function show(Tenant $tenant): JsonResponse
    {
        return response()->json([
            'data' => $tenant->subscription?->load('plan'),
        ]);
    }

    /**
     * Assign (or re-assign) a plan to a tenant. Upserts the single
     * subscription row and mirrors plan_id onto the tenant so existing
     * readers keep working; records the change on the outbox.
     */
    public function update(Request $request, Tenant $tenant, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', 'uuid', 'exists:plans,id'],
            'status' => ['nullable', Rule::in(Subscription::STATUSES)],
        ]);

        $subscription = DB::transaction(function () use ($tenant, $data, $events) {
            $subscription = Subscription::updateOrCreate(
                ['tenant_id' => $tenant->id],
                [
                    'plan_id' => $data['plan_id'],
                    'status' => $data['status'] ?? Subscription::ACTIVE,
                ]
            );

            $tenant->update(['plan_id' => $subscription->plan_id]);

            // Events carry the resolved plan (code + features) so consumers
            // can project plan limits without a callback across contexts —
            // same contract as Workforce.AgentRegistered carrying schedule.
            $events->record('Platform.SubscriptionAssigned', [
                'subscription_id' => $subscription->id,
                'tenant_id' => $tenant->id,
                'plan_id' => $subscription->plan_id,
                'plan' => [
                    'code' => $subscription->plan->code,
                    'features' => $subscription->plan->features,
                ],
                'status' => $subscription->status,
            ], $tenant->id);

            return $subscription;
        });

        return response()->json(['data' => $subscription->load('plan')]);
    }
}
