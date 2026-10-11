<?php

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\TenantScope;
use App\Models\User;
use App\Support\Uuid7;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegisterTest extends TestCase
{
    use RefreshDatabase;

    private function tenantId(): string
    {
        $id = Uuid7::new();
        TenantScope::create(['id' => $id, 'name' => 'Acme Services']);

        return $id;
    }

    private function payload(string $tenantId, array $overrides = []): array
    {
        return array_merge([
            'tenant_id' => $tenantId,
            'username' => 'jane.customer',
            'email' => 'jane@example.com',
            'display_name' => 'Jane Customer',
            'password' => 'secret-pass-123',
            'password_confirmation' => 'secret-pass-123',
        ], $overrides);
    }

    public function test_customer_can_register_into_a_tenant_scope(): void
    {
        $tenantId = $this->tenantId();

        $response = $this->postJson('/api/v1/auth/register', $this->payload($tenantId));

        $response->assertStatus(201)
            ->assertJsonStructure(['access_token', 'expires_in', 'data' => ['username', 'roles']]);

        $user = User::where('scope', $tenantId)->where('username', 'jane.customer')->firstOrFail();
        $this->assertContains(Role::CUSTOMER, $user->roleNames());
        $this->assertDatabaseHas('outbox', ['type' => 'Identity.UserRegistered']);
    }

    public function test_register_rejects_unknown_tenant(): void
    {
        $response = $this->postJson('/api/v1/auth/register', $this->payload(Uuid7::new()));

        $response->assertStatus(422)->assertJsonValidationErrors(['tenant_id']);
    }

    public function test_register_rejects_duplicate_username_within_scope(): void
    {
        $tenantId = $this->tenantId();
        User::create([
            'scope' => $tenantId,
            'username' => 'jane.customer',
            'password' => 'whatever-123',
        ]);

        $response = $this->postJson('/api/v1/auth/register', $this->payload($tenantId));

        $response->assertStatus(422)->assertJsonValidationErrors(['username']);
    }

    public function test_same_username_allowed_in_a_different_scope(): void
    {
        $this->postJson('/api/v1/auth/register', $this->payload($this->tenantId()))
            ->assertStatus(201);

        $this->postJson('/api/v1/auth/register', $this->payload($this->tenantId()))
            ->assertStatus(201);
    }

    public function test_agent_can_register_with_service_agent_role(): void
    {
        $tenantId = $this->tenantId();

        $this->postJson('/api/v1/auth/register', $this->payload($tenantId, ['role' => Role::SERVICE_AGENT]))
            ->assertStatus(201);

        $user = User::where('scope', $tenantId)->where('username', 'jane.customer')->firstOrFail();
        $this->assertContains(Role::SERVICE_AGENT, $user->roleNames());
    }

    public function test_privileged_roles_are_not_self_assignable(): void
    {
        $response = $this->postJson('/api/v1/auth/register', $this->payload(
            $this->tenantId(),
            ['role' => Role::TENANT_ADMINISTRATOR],
        ));

        $response->assertStatus(422)->assertJsonValidationErrors(['role']);
    }
}
