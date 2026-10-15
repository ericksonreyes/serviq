<?php

namespace Tests\Feature;

use App\Models\RepairGuide;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Ramsey\Uuid\Uuid;
use Tests\TestCase;

/**
 * Semantic repair-guide search (ADR-0013): writes embed via the
 * EMBEDDING_PROVIDER port (stub under test — deterministic), reads order
 * by cosine distance on pgsql and degrade to keyword matching elsewhere
 * (sqlite test runs exercise the fallback branch).
 */
class RepairGuideSearchTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $privateKey;

    protected function setUp(): void
    {
        parent::setUp();
        $res = openssl_pkey_new(['private_key_bits' => 2048]);
        openssl_pkey_export($res, $pem);
        $this->privateKey = $pem;
        config([
            'platform.jwt.jwks_url' => null,
            'platform.jwt.public_key' => openssl_pkey_get_details($res)['key'],
        ]);
        $this->tenant = (string) Uuid::uuid7();
        putenv('EMBEDDING_PROVIDER=stub');
    }

    protected function tearDown(): void
    {
        putenv('EMBEDDING_PROVIDER');
        parent::tearDown();
    }

    private function asStaff(): static
    {
        return $this->withToken(JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Uuid::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Tenant Administrator'], 'permissions' => ['catalog.services.manage'],
            'jti' => (string) Uuid::uuid7(), 'iat' => time(), 'exp' => time() + 3600,
        ], $this->privateKey, 'RS256'));
    }

    public function test_store_embeds_the_guide_for_semantic_search(): void
    {
        $this->asStaff()->postJson("/api/v1/tenants/{$this->tenant}/repair-guides", [
            'title' => 'Unclogging a kitchen drain',
            'body' => 'Boiling water, then baking soda and vinegar, then the drain snake.',
        ])->assertCreated();

        $this->assertNotNull(RepairGuide::sole()->embedding);
    }

    public function test_search_matches_by_keyword_without_pgvector(): void
    {
        RepairGuide::create(['tenant_id' => $this->tenant, 'title' => 'Leaking faucet fix', 'body' => 'Replace the washer inside the handle.']);
        RepairGuide::create(['tenant_id' => $this->tenant, 'title' => 'Breaker keeps tripping', 'body' => 'Unplug everything on the circuit first.']);

        $hits = $this->asStaff()
            ->getJson("/api/v1/tenants/{$this->tenant}/repair-guides?q=faucet")
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $hits);
        $this->assertSame('Leaking faucet fix', $hits[0]['title']);
    }
}
