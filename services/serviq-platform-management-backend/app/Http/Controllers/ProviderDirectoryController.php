<?php

namespace App\Http\Controllers;

use App\Domain\Tenancy\TenantLifecycle;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public provider directory — the customer portal's landing page resolves
 * service providers by slug here. Anonymous like signup, but deliberately
 * narrow: only ACTIVE tenants, only display fields (slug, name,
 * description). IDs, plans, and lifecycle state stay admin-facing.
 */
class ProviderDirectoryController
{
    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $q).'%';

        $providers = Tenant::where('status', TenantLifecycle::ACTIVE)
            ->when($q !== '', fn ($query) => $query
                ->where('name', 'like', $like)
                ->orWhere('slug', 'like', $like))
            ->orderBy('name')
            ->limit(12)
            ->get(['slug', 'name', 'description']);

        return response()->json(['data' => $providers]);
    }

    public function show(string $slug): JsonResponse
    {
        $provider = Tenant::where('slug', $slug)
            ->where('status', TenantLifecycle::ACTIVE)
            ->first(['slug', 'name', 'description']);

        abort_if($provider === null, 404);

        return response()->json(['data' => $provider]);
    }
}
