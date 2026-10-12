<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\ServiceRequest;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Ramsey\Uuid\Uuid;
use Tests\TestCase;

/**
 * The booking gate (ADR-0023): request creation probes Service
 * Management's coverage check before the request exists. The probe
 * itself is covered by the service-management CoverageTest; these cases
 * exercise the gate's outcomes — reject, pass-through, unavailable.
 */
class ServiceRequestCoverageTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $privateKey;
    private Customer $customer;

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
        $this->customer = Customer::create([
            'tenant_id' => $this->tenant,
            'user_id' => (string) Uuid::uuid7(),
            'name' => 'Juan Dela Cruz',
        ]);
    }

    private function asTenant(): static
    {
        return $this->withToken(JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Uuid::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => [], 'permissions' => ['requests.manage'],
            'jti' => (string) Uuid::uuid7(), 'iat' => time(), 'exp' => time() + 3600,
        ], $this->privateKey, 'RS256'));
    }

    private function fakeCoverage(array $data): void
    {
        Http::fake(['*coverage/check*' => Http::response(['data' => $data])]);
    }

    private function book(array $overrides = []): \Illuminate\Testing\TestResponse
    {
        return $this->asTenant()->postJson('/api/v1/requests', [
            'tenant_id' => $this->tenant,
            'customer_id' => $this->customer->id,
            ...$overrides,
        ]);
    }

    public function test_outside_coverage_rejects_with_422(): void
    {
        $this->fakeCoverage(['covered' => false, 'reason' => 'outside']);

        $this->book(['address' => ['admin_code' => '1380500001']])
            ->assertStatus(422)
            ->assertJson(['error' => 'outside_coverage']);
        $this->assertSame(0, ServiceRequest::count());
    }

    public function test_covered_address_creates_request_with_code(): void
    {
        $this->fakeCoverage(['covered' => true, 'reason' => 'within']);

        $this->book(['address' => ['line1' => '1 Main St', 'admin_code' => '1380700001']])
            ->assertStatus(201);
        $this->assertSame('1380700001', ServiceRequest::first()->details['admin_code']);
    }

    public function test_saved_address_code_is_checked(): void
    {
        $address = CustomerAddress::create([
            'tenant_id' => $this->tenant,
            'customer_id' => $this->customer->id,
            'label' => 'Home',
            'address' => ['line1' => '1 Main St', 'admin_code' => '1380500001'],
        ]);
        $this->fakeCoverage(['covered' => false, 'reason' => 'outside']);

        $this->book(['address_id' => $address->id])->assertStatus(422);
    }

    public function test_address_without_code_rejects_when_unverifiable(): void
    {
        $this->fakeCoverage(['covered' => false, 'reason' => 'unverifiable']);

        $this->book(['address' => ['line1' => '1 Main St']])
            ->assertStatus(422)
            ->assertJson(['error' => 'address_unverifiable']);
    }

    public function test_unconfigured_tenant_books_freely(): void
    {
        $this->fakeCoverage(['covered' => true, 'reason' => 'unrestricted']);

        $this->book(['address' => ['line1' => '1 Main St']])->assertStatus(201);
    }

    public function test_probe_outage_fails_closed_as_503(): void
    {
        Http::fake(['*coverage/check*' => Http::response('', 500)]);

        $this->book(['address' => ['admin_code' => '1380700001']])
            ->assertStatus(503)
            ->assertJson(['error' => 'coverage_unavailable']);
        $this->assertSame(0, ServiceRequest::count());
    }
}
