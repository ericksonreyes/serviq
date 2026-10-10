<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Tenant-scoped routes: the caller must be the platform (Platform
 * Administrator) or hold a token for the tenant in the route. The tenant id
 * is read from `{tenant}` route parameter or the `tenant_id` request field.
 */
class RequireTenantScope
{
    public function handle(Request $request, Closure $next): Response
    {
        $identity = $request->user();
        if ($identity === null) {
            return response()->json(['error' => 'unauthenticated'], 401);
        }

        $tenant = $request->route('tenant') ?? $request->input('tenant_id');
        if (is_object($tenant)) {
            $tenant = $tenant->tenant_id ?? $tenant->id ?? null;
        }

        if (! $identity->isPlatform() && $identity->tenantId() !== $tenant) {
            return response()->json([
                'error' => 'forbidden',
                'message' => 'Token tenant scope does not match the requested tenant',
            ], 403);
        }

        // Non-platform callers get their tenant pinned — bodies can't lie.
        if (! $identity->isPlatform()) {
            $request->merge(['tenant_id' => $identity->tenantId()]);
        }

        return $next($request);
    }
}
