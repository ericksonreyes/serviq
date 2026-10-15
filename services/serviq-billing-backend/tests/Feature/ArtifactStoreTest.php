<?php

namespace Tests\Feature;

use App\Services\Storage\ArtifactStore;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Tests\TestCase;

/**
 * The storage port earns its keep here: evidence upload + retrieval run
 * end-to-end against an in-memory fake — no MinIO, no S3 credentials.
 * The adapter's job (S3ArtifactStore) is exercised by the live stack;
 * the port's job is that the HTTP layer never knows which is bound.
 */
class ArtifactStoreTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = (string) Str::uuid7();
    }

    private function token(): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Dispatcher'], 'jti' => (string) Str::uuid(),
            'permissions' => ['billing.payments.record', 'billing.remit'],
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    public function test_upload_and_stream_roundtrip_through_the_port(): void
    {
        $fake = new InMemoryArtifactStore;
        $this->app->instance(ArtifactStore::class, $fake);

        $bytes = 'fake-png-bytes-'.Str::random(16);
        $created = $this->withToken($this->token())
            ->json('POST', "/api/v1/tenants/{$this->tenant}/payment-evidence", [
                'document_type' => 'E_WALLET',
                'file_b64' => base64_encode($bytes),
                'filename' => 'receipt.png',
                'extracted' => ['reference' => 'REF-'.Str::random(8), 'amount_cents' => 150000],
            ])
            ->assertCreated();

        // The port returned a "bucket/key" ref and held the bytes.
        $ref = $created->json('data.file_ref') ?? $created->json('file_ref');
        $this->assertNotNull($ref);
        $this->assertSame($bytes, $fake->objects[$ref] ?? null);

        // Retrieval streams the artifact back through the same port.
        $id = $created->json('data.id') ?? $created->json('id');
        $resp = $this->withToken($this->token())
            ->get("/api/v1/tenants/{$this->tenant}/payment-evidence/{$id}/file");
        $resp->assertOk();
        $this->assertSame($bytes, $resp->streamedContent());
    }

    public function test_foreign_file_ref_returns_404(): void
    {
        $fake = new InMemoryArtifactStore;
        $this->app->instance(ArtifactStore::class, $fake);

        $created = $this->withToken($this->token())
            ->json('POST', "/api/v1/tenants/{$this->tenant}/payment-evidence", [
                'document_type' => 'E_WALLET',
                'file_ref' => 'someone-elses-bucket/key.png',
                'extracted' => ['reference' => 'REF-'.Str::random(8), 'amount_cents' => 100],
            ])
            ->assertCreated();

        $id = $created->json('data.id') ?? $created->json('id');
        $this->withToken($this->token())
            ->get("/api/v1/tenants/{$this->tenant}/payment-evidence/{$id}/file")
            ->assertNotFound();
    }
}

class InMemoryArtifactStore implements ArtifactStore
{
    /** @var array<string, string> */
    public array $objects = [];

    public function put(string $tenant, string $category, string $bytes, ?string $filename = null): string
    {
        $ref = "fake-bucket/{$tenant}/{$category}/".Str::uuid7();
        $this->objects[$ref] = $bytes;

        return $ref;
    }

    public function response(string $ref): ?StreamedResponse
    {
        if (! isset($this->objects[$ref])) {
            return null;
        }
        $bytes = $this->objects[$ref];

        return response()->streamDownload(fn () => print($bytes), 'artifact');
    }
}
