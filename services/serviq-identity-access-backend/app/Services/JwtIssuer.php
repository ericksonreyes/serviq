<?php

namespace App\Services;

use App\Domain\Jwt\ClaimsBuilder;
use App\Models\User;
use App\Support\Uuid7;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Sole JWT issuer for ServIQ (ADR-0001).
 *
 * RS256 with a private key whenever one is available (env, or the
 * entrypoint-generated keypair in storage/keys/). HS256 via JWT_SECRET is a
 * local/test fallback only and is logged loudly — never silent (per
 * JWT_SIGNING_KEYS.MD).
 */
class JwtIssuer
{
    public const MODE_RS256 = 'RS256';

    public const MODE_HS256 = 'HS256';

    private ?string $mode = null;

    private ?string $kid = null;

    private bool $modeLogged = false;

    public function mode(): string
    {
        if ($this->mode === null) {
            $this->mode = $this->privateKey() !== null ? self::MODE_RS256 : self::MODE_HS256;
        }

        if (! $this->modeLogged) {
            $this->modeLogged = true;
            if ($this->mode === self::MODE_HS256) {
                Log::warning('JWT signing resolved to HS256 symmetric fallback (JWT_SECRET). '
                    .'Local/test only — configure JWT_PRIVATE_KEY for RS256.');
            } else {
                Log::info('JWT signing resolved to RS256 (asymmetric keypair).');
            }
        }

        return $this->mode;
    }

    public function issue(User $user): array
    {
        $now = time();
        $ttl = (int) config('iam.jwt.ttl');

        $payload = (new ClaimsBuilder)->build(
            $user->id,
            $user->tenantId(),
            $user->roleNames(),
            $user->permissionNames(),
            (string) config('iam.jwt.issuer'),
            (string) config('iam.jwt.audience'),
            $now,
            $ttl,
            Uuid7::new(),
        );

        if ($this->mode() === self::MODE_RS256) {
            $token = JWT::encode($payload, $this->privateKey(), 'RS256', null, ['kid' => $this->kid()]);
        } else {
            $token = JWT::encode($payload, $this->secret(), 'HS256');
        }

        return ['token' => $token, 'expires_in' => $ttl, 'claims' => $payload];
    }

    /**
     * Verify signature + registered claims (exp checked by the library).
     * Returns the decoded claims as an associative array.
     */
    public function verify(string $token): array
    {
        $mode = $this->mode();
        $key = $mode === self::MODE_RS256
            ? new Key($this->publicKey(), 'RS256')
            : new Key($this->secret(), 'HS256');

        $claims = (array) JWT::decode($token, $key);

        if (($claims['iss'] ?? null) !== config('iam.jwt.issuer')) {
            throw new RuntimeException('Invalid issuer');
        }
        if (($claims['aud'] ?? null) !== config('iam.jwt.audience')) {
            throw new RuntimeException('Invalid audience');
        }
        if (empty($claims['jti'])) {
            throw new RuntimeException('Missing jti claim');
        }
        if (empty($claims['sub'])) {
            throw new RuntimeException('Missing sub claim');
        }

        return $claims;
    }

    /**
     * Public JWKS document. Only ever exposes the public key.
     */
    public function jwks(): array
    {
        if ($this->mode() !== self::MODE_RS256) {
            return ['keys' => []];
        }

        $details = openssl_pkey_get_details(openssl_pkey_get_public($this->publicKey()));
        if ($details === false || ! isset($details['rsa'])) {
            throw new RuntimeException('Unable to parse JWT public key');
        }

        return ['keys' => [[
            'kty' => 'RSA',
            'use' => 'sig',
            'alg' => 'RS256',
            'kid' => $this->kid(),
            'n' => $this->base64Url($details['rsa']['n']),
            'e' => $this->base64Url($details['rsa']['e']),
        ]]];
    }

    public function kid(): string
    {
        return $this->kid ??= substr(hash('sha256', (string) $this->publicKey()), 0, 16);
    }

    private function privateKey(): ?string
    {
        $key = config('iam.jwt.private_key');
        if (! empty($key)) {
            return $this->normalizePem($key);
        }

        $path = config('iam.jwt.private_key_path');
        if (is_string($path) && is_file($path)) {
            return file_get_contents($path) ?: null;
        }

        return null;
    }

    private function publicKey(): ?string
    {
        $key = config('iam.jwt.public_key');
        if (! empty($key)) {
            return $this->normalizePem($key);
        }

        $path = config('iam.jwt.public_key_path');
        if (is_string($path) && is_file($path)) {
            return file_get_contents($path) ?: null;
        }

        // Fall back to deriving the public half from the private key.
        $private = $this->privateKey();
        if ($private !== null) {
            $details = openssl_pkey_get_details(openssl_pkey_get_private($private));

            return $details['key'] ?? null;
        }

        return null;
    }

    private function secret(): string
    {
        $secret = config('iam.jwt.secret');
        if (empty($secret)) {
            throw new RuntimeException(
                'No JWT key material configured. Set JWT_PRIVATE_KEY (RS256) or JWT_SECRET (local HS256 fallback).'
            );
        }

        return $secret;
    }

    private function normalizePem(string $key): string
    {
        // Allow env vars that carry the PEM with literal \n escapes.
        return str_replace('\\n', "\n", $key);
    }

    private function base64Url(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
