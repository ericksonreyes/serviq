<?php

namespace App\Services;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Verifies JWTs issued by IAM (ADR-0001) — this service never signs.
 *
 * Verification key resolution:
 *   1. JWT_PUBLIC_KEY (RS256 public key, PEM)
 *   2. JWKS fetched from IAM's endpoint (JWT_JWKS_URL)
 *   3. JWT_SECRET — HS256 symmetric fallback, local/test only and logged
 *      loudly (JWT_SIGNING_KEYS.MD)
 */
class JwtVerifier
{
    public const MODE_RS256 = 'RS256';
    public const MODE_HS256 = 'HS256';

    private ?string $mode = null;
    private bool $modeLogged = false;

    public function mode(): string
    {
        if ($this->mode === null) {
            $this->mode = $this->verificationKey() !== null || config('platform.jwt.jwks_url')
                ? self::MODE_RS256
                : self::MODE_HS256;
        }

        if (! $this->modeLogged) {
            $this->modeLogged = true;
            if ($this->mode === self::MODE_HS256) {
                Log::warning('JWT verification resolved to HS256 symmetric fallback (JWT_SECRET). '
                    .'Local/test only — configure JWT_PUBLIC_KEY or JWT_JWKS_URL for RS256.');
            } else {
                Log::info('JWT verification resolved to RS256.');
            }
        }

        return $this->mode;
    }

    /**
     * Verify signature + registered claims. Returns decoded claims.
     */
    public function verify(string $token): array
    {
        $claims = (array) JWT::decode($token, $this->keys());

        if (($claims['iss'] ?? null) !== config('platform.jwt.issuer')) {
            throw new RuntimeException('Invalid issuer');
        }
        if (($claims['aud'] ?? null) !== config('platform.jwt.audience')) {
            throw new RuntimeException('Invalid audience');
        }
        if (empty($claims['jti']) || empty($claims['sub'])) {
            throw new RuntimeException('Missing required claims');
        }

        return $claims;
    }

    private function keys(): Key|array
    {
        if ($this->mode() === self::MODE_HS256) {
            return new Key($this->secret(), 'HS256');
        }

        if ($key = $this->verificationKey()) {
            return new Key($key, 'RS256');
        }

        return $this->jwks();
    }

    private function verificationKey(): ?string
    {
        $key = config('platform.jwt.public_key');

        return empty($key) ? null : str_replace('\\n', "\n", $key);
    }

    private function jwks(): array
    {
        $url = config('platform.jwt.jwks_url');
        if (empty($url)) {
            throw new RuntimeException('No JWT verification key material configured.');
        }

        $jwks = Cache::remember('jwt.jwks', 300, function () use ($url) {
            $response = Http::timeout(5)->get($url);
            if (! $response->ok()) {
                throw new RuntimeException("JWKS fetch failed: {$response->status()}");
            }

            return $response->json();
        });

        return JWK::parseKeySet($jwks, 'RS256');
    }

    private function secret(): string
    {
        $secret = config('platform.jwt.secret');
        if (empty($secret)) {
            throw new RuntimeException(
                'No JWT key material configured. Set JWT_PUBLIC_KEY, JWT_JWKS_URL, or JWT_SECRET (local fallback).'
            );
        }

        return $secret;
    }
}
