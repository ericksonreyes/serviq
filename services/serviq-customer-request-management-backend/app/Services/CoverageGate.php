<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Synchronous coverage probe against Service Management — the owning
 * context for service areas and the location hierarchy. The caller's
 * JWT forwards verbatim; tenant.scope validates it upstream.
 */
class CoverageGate
{
    /** @return array{covered: bool, reason: string} */
    public function check(string $tenant, ?string $code, ?string $bearerToken): array
    {
        $base = rtrim(env('SERVICE_MANAGEMENT_URL', 'http://service-management-backend'), '/');
        $res = Http::withToken($bearerToken ?? '')
            ->timeout(5)
            ->get("{$base}/api/v1/tenants/{$tenant}/coverage/check", $code ? ['code' => $code] : []);

        if (! $res->ok()) {
            return ['covered' => false, 'reason' => 'unavailable'];
        }

        return $res->json('data');
    }
}
