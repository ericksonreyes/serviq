<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Asserts the RLS tenant context for the request. Pinned before
 * SubstituteBindings (bootstrap/app.php priority) so model-bound routes
 * see the row — binding would otherwise resolve under an unpinned
 * connection and RLS would 404 every {model} endpoint.
 *
 * Runs ahead of auth, so $request->user() is usually null here and the
 * {tenant} route param is the signal. Platform tokens get pinned to the
 * declared tenant — still the correct scope for a /tenants/{x}/ route.
 * `tenant.scope` still rejects mismatched tokens afterwards.
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
