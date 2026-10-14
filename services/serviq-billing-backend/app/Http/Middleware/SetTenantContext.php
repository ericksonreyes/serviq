<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Asserts the RLS tenant context after auth + tenant-scope validation.
 * Order matters: this runs after `tenant.scope` has already rejected
 * token/tenant mismatches, so the route param it pins is trusted.
 * Platform scope crosses tenants by definition — same bypass as console.
 */
class SetTenantContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $identity = $request->user();
        $tenant = $request->route('tenant');

        if ($identity?->isPlatform()) {
            TenantContext::asSystem();
        } elseif (is_string($tenant) && $tenant !== '') {
            TenantContext::asTenant($tenant);
        }

        return $next($request);
    }
}
