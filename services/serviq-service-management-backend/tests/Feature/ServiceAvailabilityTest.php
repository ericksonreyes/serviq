<?php

namespace Tests\Feature;

use App\Models\CatalogService;
use App\Models\ProjectedAgentAvailability;
use App\Models\TenantSetting;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Ramsey\Uuid\Uuid;
use Tests\TestCase;

/**
 * Bookable-availability math (ServiceOperationsController::availability).
 * Factors under test: projected agent schedules (Workforce events),
 * business hours, business days, recurring holidays, and provider-set
 * non-working days — plus the `crews` fallback when no agents exist.
 */
class ServiceAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $privateKey;
    private CatalogService $service;

    protected function setUp(): void
    {
        parent::setUp();
        // The container env supplies a real public key → RS256 mode. Mint a
        // throwaway pair and point the verifier at it (IAM test pattern).
        $res = openssl_pkey_new(['private_key_bits' => 2048]);
        openssl_pkey_export($res, $pem);
        $this->privateKey = $pem;
        config([
            'platform.jwt.jwks_url' => null,
            'platform.jwt.public_key' => openssl_pkey_get_details($res)['key'],
        ]);
        $this->tenant = (string) Uuid::uuid7();
        $this->service = CatalogService::create([
            'tenant_id' => $this->tenant,
            'name' => 'Aircon Cleaning',
            'price_cents' => 150000,
            'currency' => 'PHP',
            'price_type' => 'flat',
            'estimated_minutes' => 90,
            'active' => true,
        ]);
    }

    private function asTenant(): static
    {
        return $this->withToken(JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Uuid::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => [], 'permissions' => [],
            'jti' => (string) Uuid::uuid7(), 'iat' => time(), 'exp' => time() + 3600,
        ], $this->privateKey, 'RS256'));
    }

    private function availability(string $from, string $to): array
    {
        return $this->asTenant()
            ->getJson("/api/v1/tenants/{$this->tenant}/services/{$this->service->id}/availability?from=$from&to=$to")
            ->assertOk()
            ->json('data');
    }

    private function agent(string $status = 'active', int $capacity = 1, array $days = [1, 2, 3, 4, 5]): void
    {
        foreach ($days as $dow) {
            ProjectedAgentAvailability::create([
                'tenant_id' => $this->tenant,
                'agent_id' => (string) Uuid::uuid7(),
                'day_of_week' => $dow,
                'start_time' => '08:00',
                'end_time' => '17:00',
                'status' => $status,
                'capacity' => $capacity,
            ]);
        }
    }

    public function test_weekday_reflects_agent_capacity_and_start_times(): void
    {
        $this->agent(capacity: 3);

        // Mon 2026-10-12: 08:00–17:00 ÷ 90min = 6 jobs × capacity 3.
        $days = $this->availability('2026-10-12', '2026-10-12');

        $this->assertCount(1, $days);
        $this->assertSame(18, $days[0]['slots']);
        $this->assertSame('08:00', $days[0]['open']);
        $this->assertSame(['08:00', '09:30', '11:00', '12:30', '14:00', '15:30'], $days[0]['times']);
        // Hourly candidates from open through the window — every hour a
        // job could start, flagged by whether the whole job fits a shift
        // AND the window: 16:00 start would end 17:30 > close → disabled.
        $hours = collect($days[0]['hours']);
        $this->assertSame('08:00', $hours->first()['time']);
        $this->assertSame('16:00', $hours->last()['time']);
        $this->assertSame(9, $hours->count());
        $this->assertFalse($hours->last()['available']);
        $this->assertTrue($hours->where('available', true)->count() === 8);
    }

    public function test_around_the_clock_hours_support_24_7_operations(): void
    {
        // 24/7 provider: business open 00:00–24:00, agent covers 08:00–20:00.
        $this->agent(days: [1]);
        TenantSetting::create(['tenant_id' => $this->tenant, 'settings' => [
            'operating_hours' => ['monday' => ['open' => '00:00', 'close' => '24:00']],
        ]]);
        ProjectedAgentAvailability::where('tenant_id', $this->tenant)
            ->update(['start_time' => '08:00', 'end_time' => '20:00']);

        $days = $this->availability('2026-10-12', '2026-10-12');

        $this->assertCount(1, $days);
        $this->assertSame('24:00', $days[0]['close']);
        $this->assertSame(24, count($days[0]['hours'])); // 00:00 … 23:00
        $available = collect($days[0]['hours'])->where('available', true)->pluck('time');
        // Whole 90-min job must fit in 08:00–20:00 AND 00:00–24:00.
        $this->assertSame('08:00', $available->first());
        $this->assertSame('18:00', $available->last()); // ends 19:30 ✓; 19:00 ends 20:30 ✗
    }

    public function test_day_without_agent_coverage_is_unavailable(): void
    {
        $this->agent(); // Mon–Fri only

        // Sat 2026-10-17 + Sun 2026-10-18: operating hours open Sat,
        // but no agent works the weekend.
        $days = collect($this->availability('2026-10-17', '2026-10-18'));

        $this->assertEmpty($days);
    }

    public function test_recurring_holiday_closes_the_day(): void
    {
        $this->agent();
        TenantSetting::create(['tenant_id' => $this->tenant, 'settings' => ['holidays' => ['10-13']]]);

        // Tue 2026-10-13 matches MM-DD holiday.
        $days = collect($this->availability('2026-10-12', '2026-10-14'))->pluck('date');

        $this->assertSame(['2026-10-12', '2026-10-14'], $days->all());
    }

    public function test_provider_non_working_day_closes_the_day(): void
    {
        $this->agent();
        TenantSetting::create(['tenant_id' => $this->tenant, 'settings' => ['non_working_days' => ['2026-10-14']]]);

        $days = collect($this->availability('2026-10-13', '2026-10-15'))->pluck('date');

        $this->assertSame(['2026-10-13', '2026-10-15'], $days->all());
    }

    public function test_closed_business_day_is_unavailable(): void
    {
        $this->agent(days: [0]); // agent willing to work Sunday...
        TenantSetting::create(['tenant_id' => $this->tenant, 'settings' => [
            'operating_hours' => ['sunday' => ['open' => '08:00', 'close' => '17:00'], 'monday' => null],
        ]]);

        // ...but the business is closed Monday regardless.
        $days = collect($this->availability('2026-10-12', '2026-10-12'));

        $this->assertEmpty($days);
    }

    public function test_no_agent_projection_falls_back_to_crews(): void
    {
        TenantSetting::create(['tenant_id' => $this->tenant, 'settings' => ['crews' => 2]]);

        $days = $this->availability('2026-10-12', '2026-10-12');

        $this->assertSame(12, $days[0]['slots']); // 6 jobs × 2 crews
        $this->assertCount(6, $days[0]['times']);
    }

    public function test_inactive_agent_contributes_no_capacity(): void
    {
        $this->agent(status: 'inactive');

        // Rows exist (fallback bypassed) but all inactive → closed.
        $days = $this->availability('2026-10-12', '2026-10-12');

        $this->assertEmpty($days);
    }

    public function test_shift_overlap_bounds_offered_start_times(): void
    {
        foreach ([9 * 60, 13 * 60] as $i => $start) {
            ProjectedAgentAvailability::create([
                'tenant_id' => $this->tenant,
                'agent_id' => (string) Uuid::uuid7(),
                'day_of_week' => 1,
                'start_time' => sprintf('%02d:00', $start / 60),
                'end_time' => sprintf('%02d:00', $start / 60 + 3),
                'status' => 'active',
                'capacity' => 1,
            ]);
        }

        // Agents 09:00–12:00 and 13:00–16:00; the grid anchors to business
        // open (08:00) in 90-min steps — only 09:30 and 14:00 leave a whole
        // job inside a shift.
        $days = $this->availability('2026-10-12', '2026-10-12');

        $this->assertSame(['09:30', '14:00'], $days[0]['times']);
        $this->assertSame(4, $days[0]['slots']);
    }
}
