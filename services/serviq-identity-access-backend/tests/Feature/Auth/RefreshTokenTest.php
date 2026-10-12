<?php

namespace Tests\Feature\Auth;

use App\Models\RefreshToken;
use App\Models\TenantScope;
use App\Models\User;
use App\Support\Uuid7;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class RefreshTokenTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The array cache accumulates route-throttle hits across tests in
        // one process — reset it so per-minute limits apply per test.
        Cache::flush();
    }

    private function tenantId(): string
    {
        $id = Uuid7::new();
        TenantScope::create(['id' => $id, 'name' => 'Acme Services']);

        return $id;
    }

    private function registerUser(string $tenantId, string $username = 'jane.customer'): array
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'tenant_id' => $tenantId,
            'username' => $username,
            'email' => "{$username}@example.com",
            'display_name' => 'Jane Customer',
            'password' => 'secret-pass-123',
            'password_confirmation' => 'secret-pass-123',
        ]);

        return $response->assertStatus(201)->json();
    }

    public function test_register_and_login_issue_a_refresh_token(): void
    {
        $tenantId = $this->tenantId();
        $this->registerUser($tenantId);

        $this->postJson('/api/v1/auth/register', [
            'tenant_id' => $tenantId,
            'username' => 'other.user',
            'email' => 'other@example.com',
            'display_name' => 'Other User',
            'password' => 'secret-pass-123',
            'password_confirmation' => 'secret-pass-123',
        ])->assertJsonStructure(['access_token', 'refresh_token']);

        $this->postJson('/api/v1/auth/login', [
            'tenant_id' => $tenantId,
            'username' => 'jane.customer',
            'password' => 'secret-pass-123',
        ])->assertOk()->assertJsonStructure(['access_token', 'refresh_token']);
    }

    public function test_refresh_rotates_and_old_token_is_revoked(): void
    {
        $tenantId = $this->tenantId();
        $res = $this->registerUser($tenantId);
        $refreshToken = $res['refresh_token'];

        $rotated = $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $refreshToken]);

        $rotated->assertOk()
            ->assertJsonStructure(['access_token', 'expires_in', 'refresh_token'])
            ->assertJsonMissing(['error']);

        // Rotation: the presented token was revoked — reuse fails closed.
        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $refreshToken])
            ->assertUnauthorized()
            ->assertJsonPath('error', 'invalid_refresh_token');

        // The rotated token works for the next cycle.
        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $rotated->json('refresh_token')])
            ->assertOk()->assertJsonStructure(['access_token']);
    }

    public function test_refresh_rejects_unknown_garbage_and_expired_tokens(): void
    {
        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => 'not-a-token'])
            ->assertUnauthorized()
            ->assertJsonPath('error', 'invalid_refresh_token');

        $this->registerUser($this->tenantId());
        $user = User::first();
        RefreshToken::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', 'expired-token'),
            'expires_at' => now()->subMinute(),
        ]);

        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => 'expired-token'])
            ->assertUnauthorized();
    }

    public function test_refresh_rejects_deactivated_users_token(): void
    {
        $tenantId = $this->tenantId();
        $res = $this->registerUser($tenantId);

        User::where('username', 'jane.customer')->update(['status' => User::STATUS_DISABLED]);

        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $res['refresh_token']])
            ->assertUnauthorized()
            ->assertJsonPath('error', 'invalid_refresh_token');
    }

    public function test_logout_revokes_the_refresh_token(): void
    {
        $tenantId = $this->tenantId();
        $res = $this->registerUser($tenantId);

        $this->withHeaders(['Authorization' => "Bearer {$res['access_token']}"])
            ->postJson('/api/v1/auth/logout', ['refresh_token' => $res['refresh_token']])
            ->assertOk()->assertJsonPath('revoked', true);

        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $res['refresh_token']])
            ->assertUnauthorized();
    }

    public function test_refresh_rejects_missing_token(): void
    {
        $this->postJson('/api/v1/auth/refresh', [])->assertUnprocessable();
    }
}
