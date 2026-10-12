<?php

namespace Tests\Feature;

use App\Models\Assignment;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Offer lifecycle: exactly one accept wins, expired/decided offers are
 * dead, tenant scope enforced. Covers the race-guard transition.
 */
class OfferFlowTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = (string) Str::uuid7();
        $this->agent = (string) Str::uuid7();
    }

    private function token(): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Service Agent'], 'permissions' => ['jobs.execute'],
            'jti' => (string) Str::uuid(),
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function offer(array $overrides = []): Assignment
    {
        return Assignment::create(array_merge([
            'id' => (string) Str::uuid7(), 'job_id' => (string) Str::uuid7(),
            'tenant_id' => $this->tenant, 'agent_id' => $this->agent,
            'strategy' => 'automatic', 'status' => Assignment::OFFERED,
            'expires_at' => now()->addMinutes(5),
        ], $overrides));
    }

    private function api(string $method, Assignment $a, ?string $agent = null)
    {
        return $this->withToken($this->token())->postJson(
            "/api/v1/tenants/{$this->tenant}/assignments/{$a->id}{$method}",
            ['agent_id' => $agent ?? $this->agent],
        );
    }

    public function test_live_offer_accepts_once(): void
    {
        $offer = $this->offer();
        $this->api('/accept', $offer)->assertOk();
        $this->assertEquals(Assignment::ACCEPTED, $offer->fresh()->status);
        $this->assertDatabaseHas('outbox', ['type' => 'Assignment.Accepted']);
    }

    public function test_expired_and_wrong_agent_offers_cannot_accept(): void
    {
        $this->api('/accept', $this->offer(['expires_at' => now()->subMinute()]))->assertStatus(409);
        $this->api('/accept', $this->offer(), (string) Str::uuid7())->assertStatus(409);
    }

    public function test_decided_offer_cannot_reaccept(): void
    {
        $offer = $this->offer();
        $this->api('/accept', $offer)->assertOk();
        $this->api('/accept', $offer)->assertStatus(409); // already decided
    }

    public function test_agent_can_reject_offer(): void
    {
        $offer = $this->offer();
        $this->api('/reject', $offer)->assertOk();
        $this->assertEquals(Assignment::REJECTED, $offer->fresh()->status);
        $this->assertDatabaseHas('outbox', ['type' => 'Assignment.Rejected']);
    }

    public function test_foreign_tenant_offer_is_not_found(): void
    {
        $other = $this->offer(['tenant_id' => (string) Str::uuid7()]);
        $this->api('/accept', $other)->assertNotFound();
        $this->api('/reject', $other)->assertNotFound();
    }

    public function test_unprojected_job_returns_actionable_404(): void
    {
        $this->withToken($this->token())
            ->getJson("/api/v1/tenants/{$this->tenant}/dispatch/recommend?job_id=".Str::uuid7())
            ->assertNotFound()
            ->assertJsonPath('message', 'This job has not reached dispatch yet — it appears a few seconds after release. Try again shortly.');
    }
}
