<?php

namespace App\Auth;

use Illuminate\Contracts\Auth\Authenticatable;

/**
 * The authenticated principal resolved from a verified JWT. Other services
 * trust these claims; IAM attaches them to the request so controllers can
 * authorize without re-querying.
 */
class TokenIdentity implements Authenticatable
{
    public function __construct(private array $claims) {}

    public function claims(): array
    {
        return $this->claims;
    }

    public function userId(): string
    {
        return $this->claims['sub'];
    }

    public function tenantId(): ?string
    {
        return $this->claims['tenant_id'] ?? null;
    }

    public function isPlatform(): bool
    {
        return $this->tenantId() === null;
    }

    public function roles(): array
    {
        return $this->claims['roles'] ?? [];
    }

    public function permissions(): array
    {
        return $this->claims['permissions'] ?? [];
    }

    public function hasPermission(string $permission): bool
    {
        return in_array($permission, $this->permissions(), true);
    }

    public function canAccessScope(string $scope): bool
    {
        return $this->isPlatform() || $this->tenantId() === $scope;
    }

    public function getAuthIdentifierName(): string
    {
        return 'sub';
    }

    public function getAuthIdentifier(): string
    {
        return $this->userId();
    }

    public function getAuthPasswordName(): string
    {
        return 'password';
    }

    public function getAuthPassword(): string
    {
        return '';
    }

    public function getRememberToken(): ?string
    {
        return null;
    }

    public function setRememberToken($value): void {}

    public function getRememberTokenName(): string
    {
        return 'remember_token';
    }
}
