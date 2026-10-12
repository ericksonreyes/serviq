<?php

namespace App\Http\Controllers;

use App\Models\CoverageInterest;
use App\Models\Location;
use App\Services\Coverage;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The coverage probe — consumed synchronously by the request/booking
 * write path (CRM) and by the portal for early feedback. The decision
 * itself lives in Services\Coverage; this is just the HTTP edge.
 */
class CoverageController
{
    public function check(Request $request, string $tenant, Coverage $coverage): JsonResponse
    {
        $data = $request->validate(['code' => ['nullable', 'string', 'max:20']]);

        // No code: callers gate unverifiable addresses — report whether
        // enforcement binds at all rather than guessing at coverage.
        if (empty($data['code'])) {
            return response()->json(['data' => [
                'covered' => ! $coverage->isConfigured($tenant),
                'reason' => 'unverifiable',
            ]]);
        }

        $location = Location::find($data['code']);
        abort_unless($location, 404);

        return response()->json([
            'data' => $coverage->check($tenant, $data['code']) + [
                'location' => ['code' => $location->code, 'name' => $location->name, 'level' => $location->level],
            ],
        ]);
    }

    /**
     * Demand capture — a rejected customer registers interest in an
     * uncovered location. `user_id` comes from the token, never the body;
     * re-registering the same spot is idempotent.
     */
    public function interested(Request $request, string $tenant, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate(['admin_code' => ['required', 'string', 'max:20']]);
        $location = Location::find($data['admin_code']);
        abort_unless($location, 404);

        $interest = CoverageInterest::firstOrCreate([
            'tenant_id' => $tenant,
            'admin_code' => $data['admin_code'],
            'user_id' => $request->user()->userId(),
        ]);

        if ($interest->wasRecentlyCreated) {
            // No user_id in the payload — the notification is tenant-wide
            // staff traffic, not addressed to the interested customer.
            $events->record('ServiceManagement.CoverageInterested', [
                'admin_code' => $location->code,
                'location_name' => $location->name,
                'location_path' => $location->path(),
            ], $tenant);
        }

        return response()->json(['data' => $interest], $interest->wasRecentlyCreated ? 201 : 200);
    }

    /** Demand grouped by location — the Areas page's "people asking" list. */
    public function demand(string $tenant): JsonResponse
    {
        $rows = CoverageInterest::where('tenant_id', $tenant)
            ->selectRaw('admin_code, count(*) as interested, max(created_at) as latest')
            ->groupBy('admin_code')
            ->orderByDesc('interested')
            ->get();

        $names = Location::whereIn('code', $rows->pluck('admin_code'))->pluck('name', 'code');

        return response()->json(['data' => $rows->map(fn ($r) => [
            'admin_code' => $r->admin_code,
            'name' => $names[$r->admin_code] ?? $r->admin_code,
            'path' => Location::find($r->admin_code)?->path(),
            'interested' => (int) $r->interested,
            'latest' => $r->latest,
        ])]);
    }
}
