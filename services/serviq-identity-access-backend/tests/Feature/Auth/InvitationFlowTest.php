<?php

namespace Tests\Feature\Auth;

use App\Models\Invitation;
use App\Models\Role;
use App\Models\TenantScope;
use App\Models\User;
use App\Support\Uuid7;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Email invitations: staff create → public show/accept → user in invited
 * role. Tokens minted HS256 (config override keeps the suite independent
 * of any local storage/keys/ private key).
 */
class InvitationFlowTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $privateKey;

    protected function setUp(): void
    {
        parent::setUp();
        // IAM signs RS256 whenever a private key resolves — generate a
        // test keypair so the suite is independent of local storage/keys.
        $res = openssl_pkey_new(['private_key_bits' => 2048]);
        openssl_pkey_export($res, $pem);
        $this->privateKey = $pem;
        config(['iam.jwt.private_key' => $pem, 'iam.jwt.public_key' => openssl_pkey_get_details($res)['key']]);
        $this->tenant = Uuid7::new();
        TenantScope::create(['id' => $this->tenant, 'name' => 'Acme Services', 'slug' => 'acme']);
    }

    private function token(string $tenant, array $permissions = ['iam.users.manage']): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => Uuid7::new(), 'tenant_id' => $tenant,
            'roles' => ['Tenant Administrator'], 'permissions' => $permissions,
            'jti' => (string) \Illuminate\Support\Str::uuid(),
            'iat' => time(), 'exp' => time() + 3600,
        ], $this->privateKey, 'RS256');
    }

    private function acceptPayload(array $overrides = []): array
    {
        return array_merge([
            'username' => 'anna.agent',
            'display_name' => 'Anna Agent',
            'password' => 'secret-pass-123',
            'password_confirmation' => 'secret-pass-123',
        ], $overrides);
    }

    public function test_staff_can_create_an_invitation(): void
    {
        $r = $this->withToken($this->token($this->tenant))
            ->postJson("/api/v1/tenants/{$this->tenant}/invitations", [
                'email' => 'anna@example.com', 'role' => 'Service Agent',
            ]);

        $r->assertStatus(201)->assertJsonStructure(['data' => ['email', 'role', 'accept_url']]);
        $this->assertDatabaseHas('invitations', ['email' => 'anna@example.com', 'status' => 'pending']);
        $this->assertDatabaseHas('outbox', ['type' => 'Identity.InvitationCreated']);
    }

    public function test_invite_requires_permission_and_own_tenant(): void
    {
        // no iam.users.manage
        $this->withToken($this->token($this->tenant, []))
            ->postJson("/api/v1/tenants/{$this->tenant}/invitations", [
                'email' => 'a@b.com', 'role' => 'Customer',
            ])->assertStatus(403);

        // another tenant's scope
        $other = Uuid7::new();
        TenantScope::create(['id' => $other, 'name' => 'Other Co', 'slug' => 'other']);
        $this->withToken($this->token($this->tenant))
            ->postJson("/api/v1/tenants/{$other}/invitations", [
                'email' => 'a@b.com', 'role' => 'Customer',
            ])->assertStatus(403);

        // non-invitable role rejected
        $this->withToken($this->token($this->tenant))
            ->postJson("/api/v1/tenants/{$this->tenant}/invitations", [
                'email' => 'a@b.com', 'role' => 'Platform Administrator',
            ])->assertStatus(422);
    }

    public function test_invitee_accepts_and_lands_in_invited_role(): void
    {
        $this->withToken($this->token($this->tenant))
            ->postJson("/api/v1/tenants/{$this->tenant}/invitations", [
                'email' => 'anna@example.com', 'role' => 'Service Agent',
            ]);
        // The raw token only exists in the outbox event — recover it from there.
        $raw = json_decode(\Illuminate\Support\Facades\DB::table('outbox')
            ->where('type', 'Identity.InvitationCreated')->value('payload'), true)['token'];

        $this->getJson("/api/v1/invitations/{$raw}")
            ->assertOk()->assertJsonPath('data.email', 'anna@example.com')
            ->assertJsonPath('data.role', 'Service Agent');

        $r = $this->postJson("/api/v1/invitations/{$raw}/accept", $this->acceptPayload());
        $r->assertStatus(201)->assertJsonStructure(['access_token']);

        $user = User::where('scope', $this->tenant)->where('username', 'anna.agent')->firstOrFail();
        $this->assertContains(Role::SERVICE_AGENT, $user->roleNames());
        $this->assertEquals('anna@example.com', $user->email);
        $this->assertEquals(Invitation::ACCEPTED, Invitation::first()->status);
    }

    public function test_accept_rejects_replay_and_unknown_tokens(): void
    {
        $this->withToken($this->token($this->tenant))
            ->postJson("/api/v1/tenants/{$this->tenant}/invitations", [
                'email' => 'bob@example.com', 'role' => 'Customer',
            ]);
        $raw = json_decode(\Illuminate\Support\Facades\DB::table('outbox')
            ->where('type', 'Identity.InvitationCreated')->value('payload'), true)['token'];

        $this->postJson("/api/v1/invitations/{$raw}/accept", $this->acceptPayload(['username' => 'bob.c']))->assertStatus(201);
        $this->postJson("/api/v1/invitations/{$raw}/accept", $this->acceptPayload(['username' => 'bob.d']))->assertStatus(410);
        $this->postJson("/api/v1/invitations/not-a-token/accept", $this->acceptPayload())->assertStatus(404);
    }

    public function test_expired_invitation_is_gone(): void
    {
        $this->withToken($this->token($this->tenant))
            ->postJson("/api/v1/tenants/{$this->tenant}/invitations", [
                'email' => 'old@example.com', 'role' => 'Customer',
            ]);
        Invitation::query()->update(['expires_at' => now()->subDay()]);
        $raw = json_decode(\Illuminate\Support\Facades\DB::table('outbox')
            ->where('type', 'Identity.InvitationCreated')->value('payload'), true)['token'];

        $this->postJson("/api/v1/invitations/{$raw}/accept", $this->acceptPayload())->assertStatus(410);
    }
}
