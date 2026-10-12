<?php

namespace Tests\Feature\Auth;

use App\Events\Handlers\TenantCreatedHandler;
use App\Models\Permission;
use App\Models\Role;
use App\Models\TenantScope;
use App\Models\User;
use App\Support\Uuid7;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Tenant Administrators hold iam.users.* / iam.roles.read — every one of
 * those must stay inside their own tenant.
 */
class TenantAdministratorScopeTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $other;
    private string $privateKey;

    protected function setUp(): void
    {
        parent::setUp();
        $res = openssl_pkey_new(['private_key_bits' => 2048]);
        openssl_pkey_export($res, $pem);
        $this->privateKey = $pem;
        config(['iam.jwt.private_key' => $pem, 'iam.jwt.public_key' => openssl_pkey_get_details($res)['key']]);
        $this->tenant = Uuid7::new();
        $this->other = Uuid7::new();
        TenantScope::create(['id' => $this->tenant, 'name' => 'Acme', 'slug' => 'acme']);
        TenantScope::create(['id' => $this->other, 'name' => 'Other Co', 'slug' => 'other']);
        foreach ([$this->tenant => 'mine', $this->other => 'theirs'] as $scope => $name) {
            User::create(['scope' => $scope, 'username' => "$name.user", 'password' => 'secret-pass-123']);
            Role::create(['scope' => $scope, 'name' => Role::DISPATCHER]);
        }
    }

    private function admin(): static
    {
        return $this->withToken(JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => Uuid7::new(), 'tenant_id' => $this->tenant,
            'roles' => [Role::TENANT_ADMINISTRATOR],
            'permissions' => Role::DEFAULT_PERMISSIONS[Role::TENANT_ADMINISTRATOR],
            'jti' => Uuid7::new(), 'iat' => time(), 'exp' => time() + 3600,
        ], $this->privateKey, 'RS256'));
    }

    public function test_user_list_defaults_to_the_callers_tenant(): void
    {
        $names = collect($this->admin()->getJson('/api/v1/users')->assertOk()->json('data'))->pluck('username');

        $this->assertSame(['mine.user'], $names->all());
    }

    public function test_role_list_defaults_to_the_callers_tenant(): void
    {
        $scopes = collect($this->admin()->getJson('/api/v1/roles')->assertOk()->json('data'))->pluck('scope')->unique();

        $this->assertSame([$this->tenant], $scopes->values()->all());
    }

    public function test_cannot_read_or_write_another_tenant(): void
    {
        $this->admin()->getJson("/api/v1/users?scope={$this->other}")->assertForbidden();
        $this->admin()->getJson("/api/v1/roles?scope={$this->other}")->assertForbidden();
        $this->admin()->postJson('/api/v1/users', [
            'scope' => $this->other, 'username' => 'intruder', 'password' => 'secret-pass-123',
        ])->assertForbidden();
        $this->admin()->postJson('/api/v1/users', [
            'scope' => 'platform', 'username' => 'intruder', 'password' => 'secret-pass-123',
        ])->assertForbidden();
        $theirs = User::where('scope', $this->other)->first();
        $this->admin()->patchJson("/api/v1/users/{$theirs->id}", ['status' => 'disabled'])->assertForbidden();
        $this->admin()->postJson("/api/v1/users/{$theirs->id}/roles", ['roles' => [Role::DISPATCHER]])->assertForbidden();
        $this->assertDatabaseMissing('users', ['username' => 'intruder']);
    }

    public function test_can_create_a_user_in_own_tenant(): void
    {
        $this->admin()->postJson('/api/v1/users', [
            'scope' => $this->tenant, 'username' => 'new.dispatcher',
            'password' => 'secret-pass-123', 'roles' => [Role::DISPATCHER],
        ])->assertCreated();
    }

    public function test_provisioned_tenant_administrator_gets_tenant_permissions(): void
    {
        // Provisioning joins names to rows — the catalog the seeder
        // populates in production must exist here too.
        foreach (Permission::CATALOG as $name => $description) {
            Permission::firstOrCreate(['name' => $name], ['description' => $description]);
        }

        $tenant = Uuid7::new();
        (new TenantCreatedHandler)->handle(['payload' => [
            'tenant_id' => $tenant, 'name' => 'New Co', 'slug' => 'newco',
            'initial_users' => [[
                'username' => 'new.admin', 'password' => bcrypt('secret-pass-123'),
                'role' => Role::TENANT_ADMINISTRATOR,
            ]],
        ]]);

        $user = User::where(['scope' => $tenant, 'username' => 'new.admin'])->first();
        $this->assertEqualsCanonicalizing(Role::DEFAULT_PERMISSIONS[Role::TENANT_ADMINISTRATOR], $user->permissionNames());
    }
}
