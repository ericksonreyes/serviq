<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Throwable;

/**
 * Shared Redis JWT blacklist (JWT_INVALIDATION.MD), keyed
 * jwt:blacklist:<jti> with TTL = the token's remaining lifetime.
 *
 * If Redis is unconfigured or unreachable the service falls back to
 * exp-only validation — observable (logged), never silent.
 */
class TokenBlacklist
{
    private const PREFIX = 'jwt:blacklist:';

    public function revoke(string $jti, int $expiresAt): void
    {
        $ttl = max(1, $expiresAt - time());

        try {
            Redis::connection()->setex(self::PREFIX.$jti, $ttl, '1');
        } catch (Throwable $e) {
            Log::warning('JWT blacklist unreachable — token not revoked, exp-only applies', [
                'jti' => $jti, 'error' => $e->getMessage(),
            ]);
        }
    }

    public function isRevoked(string $jti): bool
    {
        try {
            return (bool) Redis::connection()->exists(self::PREFIX.$jti);
        } catch (Throwable $e) {
            // Documented fallback: no Redis → exp-only validation.
            Log::warning('JWT blacklist unreachable — exp-only validation in effect', [
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
