<?php

namespace App\Domain\Jwt;

/**
 * Builds the canonical ServIQ JWT claim set (IDENTITY_ACCESS.MD /
 * ADR-0001). Pure PHP — no framework dependencies — so the claim contract
 * is spec'd deterministically.
 */
class ClaimsBuilder
{
    public function build(
        string $userId,
        ?string $tenantId,
        string $username,
        ?string $displayName,
        array $roles,
        array $permissions,
        string $issuer,
        string $audience,
        int $issuedAt,
        int $ttlSeconds,
        string $tokenId,
    ): array {
        return [
            'sub' => $userId,
            'tenant_id' => $tenantId,
            'username' => $username,
            'display_name' => $displayName,
            'roles' => array_values($roles),
            'permissions' => array_values($permissions),
            'iss' => $issuer,
            'aud' => $audience,
            'iat' => $issuedAt,
            'exp' => $issuedAt + $ttlSeconds,
            'jti' => $tokenId,
        ];
    }
}
