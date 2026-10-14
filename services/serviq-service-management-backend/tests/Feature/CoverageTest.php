<?php

namespace Tests\Feature;

use App\Models\ServiceArea;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Ramsey\Uuid\Uuid;
use Tests\TestCase;

/**
 * Booking coverage gate (ADR-0023): the ancestor walk — coarse stored
 * coverage resolves against the deepest submitted code. Exclusions and
 * the countrywide flag share the same spec shape.
 */
class CoverageTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $privateKey;

    // Miniature hierarchy: NCR › {Marikina › Concepcion Uno} + {QC › Holy Spirit}
    private const REGION = '1300000000';
    private const MARIKINA = '1380700000';
    private const CONCEPCION = '1380700001';
    private const QC = '1380500000';
    private const HOLY_SPIRIT = '1380500001';

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

        DB::table('locations')->insert([
            ['code' => self::REGION, 'name' => 'National Capital Region', 'level' => 'region', 'parent_code' => null, 'country' => 'PH'],
            ['code' => self::MARIKINA, 'name' => 'City of Marikina', 'level' => 'city', 'parent_code' => self::REGION, 'country' => 'PH'],
            ['code' => self::CONCEPCION, 'name' => 'Concepcion Uno', 'level' => 'barangay', 'parent_code' => self::MARIKINA, 'country' => 'PH'],
            ['code' => self::QC, 'name' => 'Quezon City', 'level' => 'city', 'parent_code' => self::REGION, 'country' => 'PH'],
            ['code' => self::HOLY_SPIRIT, 'name' => 'Holy Spirit', 'level' => 'barangay', 'parent_code' => self::QC, 'country' => 'PH'],
        ]);
    }

    private function asTenant(array $permissions = []): static
    {
        return $this->withToken(JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Uuid::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => [], 'permissions' => $permissions,
            'jti' => (string) Uuid::uuid7(), 'iat' => time(), 'exp' => time() + 3600,
        ], $this->privateKey, 'RS256'));
    }

    private function check(string $code): array
    {
        return $this->asTenant()
            ->getJson("/api/v1/tenants/{$this->tenant}/coverage/check?code={$code}")
            ->assertOk()->json('data');
    }

    public function test_open_when_no_coverage_declared(): void
    {
        $this->assertSame('unrestricted', $this->check(self::CONCEPCION)['reason']);
    }

    public function test_city_coverage_matches_barangay_via_ancestors(): void
    {
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);

        $verdict = $this->check(self::CONCEPCION);
        $this->assertTrue($verdict['covered']);
        $this->assertSame('within', $verdict['reason']);
        $this->assertSame(self::MARIKINA, $verdict['matched_location']);
    }

    public function test_outside_coverage_rejected(): void
    {
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);

        $verdict = $this->check(self::HOLY_SPIRIT);
        $this->assertFalse($verdict['covered']);
        $this->assertSame('outside', $verdict['reason']);
    }

    public function test_exclusion_carves_out_of_broader_coverage(): void
    {
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'NCR minus QC',
            'geo' => ['admin_areas' => [self::REGION], 'exclusions' => [self::QC]],
        ]);

        $this->assertFalse($this->check(self::HOLY_SPIRIT)['covered']);
        $this->assertTrue($this->check(self::CONCEPCION)['covered']);
    }

    public function test_explicit_granular_coverage_beats_exclusion(): void
    {
        // "All of QC except Holy Spirit... wait, actually keep Holy Spirit" —
        // the nearest explicit node on the chain decides.
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'QC less Holy Spirit',
            'geo' => ['admin_areas' => [self::HOLY_SPIRIT], 'exclusions' => [self::QC]],
        ]);

        $this->assertTrue($this->check(self::HOLY_SPIRIT)['covered']);
    }

    public function test_countrywide_short_circuits(): void
    {
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'National',
            'geo' => ['countrywide' => true],
        ]);

        $this->assertSame('countrywide', $this->check(self::HOLY_SPIRIT)['reason']);
    }

    public function test_missing_code_reports_whether_enforcement_binds(): void
    {
        $res = $this->asTenant()->getJson("/api/v1/tenants/{$this->tenant}/coverage/check")->assertOk();
        $this->assertTrue($res->json('data.covered'));           // unconfigured → open

        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);

        $res = $this->asTenant()->getJson("/api/v1/tenants/{$this->tenant}/coverage/check")->assertOk();
        $this->assertFalse($res->json('data.covered'));          // configured → unverifiable
        $this->assertSame('unverifiable', $res->json('data.reason'));
    }

    public function test_search_resolves_names_to_codes(): void
    {
        $res = $this->asTenant()->getJson('/api/v1/locations/search?q=marikina')->assertOk();
        $hits = collect($res->json('data'));
        $marikina = $hits->firstWhere('code', self::MARIKINA);
        $this->assertSame('National Capital Region › City of Marikina', $marikina['path']);

        // Barangay hits carry the full breadcrumb for disambiguation.
        $res = $this->asTenant()->getJson('/api/v1/locations/search?q=concepcion')->assertOk();
        $concepcion = collect($res->json('data'))->firstWhere('code', self::CONCEPCION);
        $this->assertSame('National Capital Region › City of Marikina › Concepcion Uno', $concepcion['path']);
    }

    public function test_children_walk_one_level(): void
    {
        $res = $this->asTenant()->getJson('/api/v1/locations/'.self::MARIKINA.'/children')->assertOk();
        $this->assertSame([self::CONCEPCION], collect($res->json('data'))->pluck('code')->all());
    }

    public function test_outside_verdict_lists_what_is_covered(): void
    {
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);
        // A barangay inside a covered city adds no extra name — the
        // top-level node carries the list.
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Extra pocket',
            'geo' => ['admin_areas' => [self::CONCEPCION]],
        ]);

        $verdict = $this->check(self::HOLY_SPIRIT);
        $this->assertSame(['City of Marikina'], $verdict['covered_names']);
    }

    public function test_interest_registers_once_and_aggregates(): void
    {
        // Enforcement must bind before interest is meaningful — declare
        // coverage that leaves Holy Spirit outside.
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);

        // One user, two attempts at the same spot — the row dedupes.
        $token = JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Uuid::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => [], 'permissions' => [],
            'jti' => (string) Uuid::uuid7(), 'iat' => time(), 'exp' => time() + 3600,
        ], $this->privateKey, 'RS256');

        $this->withToken($token)->postJson("/api/v1/tenants/{$this->tenant}/coverage/interest", [
            'admin_code' => self::HOLY_SPIRIT,
        ])->assertStatus(201);
        $this->withToken($token)->postJson("/api/v1/tenants/{$this->tenant}/coverage/interest", [
            'admin_code' => self::HOLY_SPIRIT,
        ])->assertStatus(200);

        $demand = $this->asTenant(['catalog.services.manage'])
            ->getJson("/api/v1/tenants/{$this->tenant}/coverage/interest")
            ->assertOk()->json('data');

        $this->assertCount(1, $demand);
        $this->assertSame(self::HOLY_SPIRIT, $demand[0]['admin_code']);
        $this->assertSame(1, $demand[0]['interested']);
        $this->assertSame('Holy Spirit', $demand[0]['name']);
    }

    public function test_demand_is_tenant_scoped(): void
    {
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);

        $this->asTenant()->postJson("/api/v1/tenants/{$this->tenant}/coverage/interest", [
            'admin_code' => self::HOLY_SPIRIT,
        ])->assertStatus(201);

        $other = (string) Uuid::uuid7();
        $this->withToken(JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Uuid::uuid7(), 'tenant_id' => $other,
            'roles' => [], 'permissions' => ['catalog.services.manage'],
            'jti' => (string) Uuid::uuid7(), 'iat' => time(), 'exp' => time() + 3600,
        ], $this->privateKey, 'RS256'))
            ->getJson("/api/v1/tenants/{$other}/coverage/interest")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_interest_rejects_unknown_codes(): void
    {
        $this->asTenant()->postJson("/api/v1/tenants/{$this->tenant}/coverage/interest", [
            'admin_code' => '9999999999',
        ])->assertStatus(404);
    }

    public function test_interest_rejects_already_covered_locations(): void
    {
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);

        $this->asTenant()->postJson("/api/v1/tenants/{$this->tenant}/coverage/interest", [
            'admin_code' => self::CONCEPCION,
        ])->assertStatus(422);
    }

    public function test_service_area_rejects_unknown_location_codes(): void
    {
        $this->asTenant(['catalog.services.manage'])
            ->postJson("/api/v1/tenants/{$this->tenant}/service-areas", [
                'name' => 'Bogus', 'geo' => ['admin_areas' => ['9999999999']],
            ])
            ->assertStatus(422);
    }
}
