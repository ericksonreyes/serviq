<?php

namespace App\Http\Controllers;

use App\Models\FeatureFlag;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Throwable;

class MetricsController
{
    /**
     * Platform-wide operational summary. Counts come from this service's
     * own tables; the user count is fetched live from IAM with the caller's
     * token forwarded — marked unavailable rather than fabricated when IAM
     * can't be reached.
     */
    public function summary(Request $request): JsonResponse
    {
        $tenantCounts = Tenant::query()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $subscriptionCounts = Subscription::query()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'data' => [
                'tenants' => [
                    'total' => $tenantCounts->sum(),
                    'by_status' => $tenantCounts,
                ],
                'plans' => [
                    'total' => Plan::count(),
                    'active' => Plan::where('active', true)->count(),
                ],
                'subscriptions' => [
                    'total' => $subscriptionCounts->sum(),
                    'by_status' => $subscriptionCounts,
                ],
                'feature_flags' => [
                    'total' => FeatureFlag::count(),
                    'enabled' => FeatureFlag::where('enabled', true)->count(),
                ],
                'users' => $this->userCount($request),
            ],
        ]);
    }

    private function userCount(Request $request): array
    {
        $base = config('platform.iam_url');
        if (empty($base)) {
            return ['total' => null, 'available' => false];
        }

        try {
            $response = Http::timeout(5)
                ->withToken($request->bearerToken())
                ->get(rtrim($base, '/').'/api/v1/users', ['per_page' => 1]);
        } catch (Throwable) {
            return ['total' => null, 'available' => false];
        }

        if (! $response->ok()) {
            return ['total' => null, 'available' => false];
        }

        return ['total' => $response->json('total'), 'available' => true];
    }
}
