<?php

namespace Features\Bootstrap;

use App\Domain\Jwt\ClaimsBuilder;
use Behat\Behat\Context\Context;
use PHPUnit\Framework\Assert;

class IdentityContext implements Context
{
    private array $subject = [];

    private array $claims = [];

    /**
     * @Given a user :userId in tenant scope :tenantId with roles :roles and permissions :permissions
     */
    public function aUserInTenantScope(string $userId, string $tenantId, string $roles, string $permissions): void
    {
        $this->subject = [$userId, $tenantId, explode(', ', $roles), explode(', ', $permissions)];
    }

    /**
     * @Given a user :userId in platform scope with roles :roles and permissions :permissions
     */
    public function aUserInPlatformScope(string $userId, string $roles, string $permissions): void
    {
        $this->subject = [$userId, null, explode(', ', $roles), explode(', ', $permissions)];
    }

    /**
     * @When IAM issues a token for them
     */
    public function iamIssuesAToken(): void
    {
        [$userId, $tenantId, $roles, $permissions] = $this->subject;

        $this->claims = (new ClaimsBuilder)->build(
            $userId, $tenantId, $roles, $permissions,
            'serviq-iam', 'serviq', 1_700_000_000, 3600, 'token-xyz'
        );
    }

    /**
     * @Then the claims should carry sub :sub and tenant_id :tenantId
     */
    public function claimsCarrySubAndTenant(string $sub, string $tenantId): void
    {
        Assert::assertSame($sub, $this->claims['sub']);
        Assert::assertSame($tenantId === '' ? null : $tenantId, $this->claims['tenant_id']);
    }

    /**
     * @Then the claims should carry roles :roles
     */
    public function claimsCarryRoles(string $roles): void
    {
        Assert::assertSame(explode(', ', $roles), $this->claims['roles']);
    }

    /**
     * @Then the claims should carry permissions :permissions
     */
    public function claimsCarryPermissions(string $permissions): void
    {
        Assert::assertSame(explode(', ', $permissions), $this->claims['permissions']);
    }

    /**
     * @Then the token should expire :ttl seconds after issue
     */
    public function tokenExpiresAfter(string $ttl): void
    {
        Assert::assertSame($this->claims['iat'] + (int) $ttl, $this->claims['exp']);
    }

    /**
     * @Then the claims should carry issuer :iss, audience :aud and a unique jti
     */
    public function claimsCarryRegisteredClaims(string $iss, string $aud): void
    {
        Assert::assertSame($iss, $this->claims['iss']);
        Assert::assertSame($aud, $this->claims['aud']);
        Assert::assertNotEmpty($this->claims['jti']);
    }
}
