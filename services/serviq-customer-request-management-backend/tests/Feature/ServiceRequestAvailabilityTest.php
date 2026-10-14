<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\ServiceRequest;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Ramsey\Uuid\Uuid;
use Tests\TestCase;

/**
 * The schedule gate: request creation re-probes Service Management's
 * availability for the requested date/time — the portal's pickers gate
 * the UI, but a direct API call could otherwise book closures or
 * off-shift starts. The availability math itself is covered by
 * service-management's suite; these cases exercise the gate's outcomes.
 */
class ServiceRequestAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $privateKey;
    private string $serviceId;
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
        $this->serviceId = (string) Uuid::uuid7();
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

    private function fakeBackend(array $days): void
    {
        Http::fake([
            '*coverage/check*' => Http::response(['data' => ['covered' => true, 'reason' => 'within']]),
            '*availability*' => Http::response(['data' => $days]),
        ]);
    }

    private function day(array $overrides = []): array
    {
        return [
            'date' => '2030-06-10', 'slots' => 9,
            'open' => '08:00', 'close' => '17:00', 'job_minutes' => 60,
            'hours' => [], 'times' => ['08:00', '09:00', '10:00'],
            ...$overrides,
        ];
    }

    private function book(array $overrides = []): \Illuminate\Testing\TestResponse
    {
        return $this->asTenant()->postJson('/api/v1/requests', [
            'tenant_id' => $this->tenant,
            'customer_id' => $this->customer->id,
            'service_id' => $this->serviceId,
            ...$overrides,
        ]);
    }

    public function test_bookable_start_creates_request(): void
    {
        $this->fakeBackend([$this->day()]);

        $this->book(['scheduled_for' => '2030-06-10T09:00:00'])
            ->assertStatus(201);
        $this->assertSame(1, ServiceRequest::count());
    }

    public function test_closed_day_rejects_with_422(): void
    {
        // The day is absent from `days` — holiday, closure, or no
        // capacity; all unbookable for the same reason.
        $this->fakeBackend([$this->day(['date' => '2030-06-11'])]);

        $this->book(['scheduled_for' => '2030-06-10T09:00:00'])
            ->assertStatus(422)
            ->assertJson(['error' => 'outside_availability']);
        $this->assertSame(0, ServiceRequest::count());
    }

    public function test_off_cadence_time_rejects_with_bookable_list(): void
    {
        $this->fakeBackend([$this->day()]);

        $this->book(['scheduled_for' => '2030-06-10T18:00:00'])
            ->assertStatus(422)
            ->assertJson(['error' => 'outside_availability', 'bookable_times' => ['08:00', '09:00', '10:00']]);
    }

    public function test_hour_flagged_available_accepts_outside_job_cadence(): void
    {
        // A 90-minute service emits times at 08:00/09:30/11:00 — but the
        // portal's chips come from `hours`, which also flags 09:00. The
        // gate must accept what the UI offers.
        $this->fakeBackend([$this->day([
            'job_minutes' => 90,
            'times' => ['08:00', '09:30', '11:00'],
            'hours' => [
                ['time' => '08:00', 'available' => true],
                ['time' => '09:00', 'available' => true],
                ['time' => '14:00', 'available' => false],
            ],
        ])]);

        $this->book(['scheduled_for' => '2030-06-10T09:00:00'])->assertStatus(201);
        // A start inside the window but flagged uncovered by a shift stays
        // rejected (14:00 + 90 min fits the window; the flag is decisive).
        $this->book(['scheduled_for' => '2030-06-10T14:00:00'])->assertStatus(422);
    }

    public function test_date_only_preference_checks_the_day(): void
    {
        $this->fakeBackend([$this->day()]);

        $this->book(['preferred_date' => '2030-06-10'])->assertStatus(201);
        $this->book(['preferred_date' => '2030-06-12'])->assertStatus(422);
    }

    public function test_probe_outage_fails_closed_as_503(): void
    {
        Http::fake([
            '*coverage/check*' => Http::response(['data' => ['covered' => true]]),
            '*availability*' => Http::response('', 500),
        ]);

        $this->book(['scheduled_for' => '2030-06-10T09:00:00'])
            ->assertStatus(503)
            ->assertJson(['error' => 'availability_unavailable']);
        $this->assertSame(0, ServiceRequest::count());
    }

    public function test_request_without_service_skips_the_gate(): void
    {
        // No service_id — nothing to check against, so the availability
        // probe never runs even though it would fail if it did.
        Http::fake([
            '*coverage/check*' => Http::response(['data' => ['covered' => true]]),
            '*availability*' => Http::response('', 500),
        ]);

        $this->asTenant()->postJson('/api/v1/requests', [
            'tenant_id' => $this->tenant,
            'customer_id' => $this->customer->id,
        ])->assertStatus(201);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'availability'));
    }
}
