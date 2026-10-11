<?php

namespace spec\App\Domain\Jwt;

use App\Domain\Jwt\ClaimsBuilder;
use PhpSpec\ObjectBehavior;

class ClaimsBuilderSpec extends ObjectBehavior
{
    public function it_is_initializable()
    {
        $this->shouldHaveType(ClaimsBuilder::class);
    }

    public function it_builds_the_canonical_claim_set()
    {
        $claims = $this->build(
            'user-1', 'tenant-1', ['Dispatcher'], ['payout.read'],
            'serviq-iam', 'serviq', 1000, 3600, 'token-1'
        );

        $claims->shouldBeArray();
        $claims->shouldHaveKeyWithValue('sub', 'user-1');
        $claims->shouldHaveKeyWithValue('tenant_id', 'tenant-1');
        $claims->shouldHaveKeyWithValue('roles', ['Dispatcher']);
        $claims->shouldHaveKeyWithValue('permissions', ['payout.read']);
        $claims->shouldHaveKeyWithValue('iss', 'serviq-iam');
        $claims->shouldHaveKeyWithValue('aud', 'serviq');
        $claims->shouldHaveKeyWithValue('iat', 1000);
        $claims->shouldHaveKeyWithValue('exp', 4600);
        $claims->shouldHaveKeyWithValue('jti', 'token-1');
    }

    public function it_emits_null_tenant_for_platform_scope_users()
    {
        $claims = $this->build(
            'user-1', null, ['Platform Administrator'], ['iam.users.manage'],
            'serviq-iam', 'serviq', 0, 60, 'token-2'
        );

        $claims->shouldHaveKeyWithValue('tenant_id', null);
    }
}
