<?php

namespace Tests\Feature;

use App\Events\Handlers\CoverageExpansionHandler;
use App\Models\CoverageInterest;
use App\Models\ServiceArea;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Ramsey\Uuid\Uuid;
use Tests\TestCase;

/**
 * Notify-on-expansion: ServiceAreaCreated/Updated × coverage_interest →
 * ServiceManagement.CoverageSatisfied per newly-covered interested user.
 * The handler only fires for the area that caused the flip — renames and
 * unrelated coverage must not re-notify.
 */
class CoverageExpansionTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $privateKey;

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

    private function interest(string $adminCode, ?string $userId = null): CoverageInterest
    {
        return CoverageInterest::create([
            'tenant_id' => $this->tenant,
            'admin_code' => $adminCode,
            'user_id' => $userId ?? (string) Uuid::uuid7(),
        ]);
    }

    private function fire(ServiceArea $area, string $type = 'ServiceManagement.ServiceAreaCreated'): void
    {
        app(CoverageExpansionHandler::class)->handle([
            'id' => (string) Uuid::uuid7(),
            'type' => $type,
            'tenant_id' => $this->tenant,
            'payload' => ['service_area_id' => $area->id],
        ]);
    }

    private function satisfiedEvents(): \Illuminate\Support\Collection
    {
        return DB::table('outbox')->where('type', 'ServiceManagement.CoverageSatisfied')->get();
    }

    public function test_new_area_notifies_interested_users_it_newly_covers(): void
    {
        $user = (string) Uuid::uuid7();
        $interest = $this->interest(self::HOLY_SPIRIT, $user);
        $this->interest(self::CONCEPCION); // stays outside → silent

        $area = ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'QC zone',
            'geo' => ['admin_areas' => [self::QC]],
        ]);
        $this->fire($area);

        $events = $this->satisfiedEvents();
        $this->assertCount(1, $events);
        $payload = json_decode($events[0]->payload, true);
        $this->assertSame($user, $payload['user_id']);
        $this->assertSame(self::HOLY_SPIRIT, $payload['admin_code']);
        $this->assertSame('Holy Spirit', $payload['location_name']);
        $this->assertSame('QC zone', $payload['service_area_name']);
        $this->assertNotNull($interest->fresh()->notified_at);
    }

    public function test_ancestor_match_counts_as_covered(): void
    {
        // Interest at barangay depth satisfied by a region-level area.
        $interest = $this->interest(self::HOLY_SPIRIT);
        $area = ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'NCR wide',
            'geo' => ['admin_areas' => [self::REGION]],
        ]);
        $this->fire($area);

        $this->assertCount(1, $this->satisfiedEvents());
        $this->assertNotNull($interest->fresh()->notified_at);
    }

    public function test_exclusion_keeps_interest_unmet(): void
    {
        $interest = $this->interest(self::HOLY_SPIRIT);
        $area = ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'NCR minus QC',
            'geo' => ['admin_areas' => [self::REGION], 'exclusions' => [self::QC]],
        ]);
        $this->fire($area);

        $this->assertCount(0, $this->satisfiedEvents());
        $this->assertNull($interest->fresh()->notified_at);
    }

    public function test_countrywide_area_satisfies_all_unmet_interests(): void
    {
        $this->interest(self::HOLY_SPIRIT);
        $this->interest(self::CONCEPCION);

        $area = ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'National',
            'geo' => ['countrywide' => true],
        ]);
        $this->fire($area);

        $this->assertCount(2, $this->satisfiedEvents());
        $this->assertSame(0, CoverageInterest::whereNull('notified_at')->count());
    }

    public function test_only_the_causing_area_notifies(): void
    {
        // Already covered by an existing area — an unrelated new area
        // must not send "we now cover you" (interest can't be registered
        // via the API in this state, but the guard pins the semantics).
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);
        $interest = $this->interest(self::CONCEPCION);

        $other = ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'QC zone',
            'geo' => ['admin_areas' => [self::QC]],
        ]);
        $this->fire($other);

        $this->assertCount(0, $this->satisfiedEvents());
        $this->assertNull($interest->fresh()->notified_at);
    }

    public function test_fulfilled_interest_is_not_renotified(): void
    {
        $interest = $this->interest(self::HOLY_SPIRIT);
        $area = ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'QC zone',
            'geo' => ['admin_areas' => [self::QC]],
        ]);
        $this->fire($area);
        $this->fire($area, 'ServiceManagement.ServiceAreaUpdated'); // rename etc.

        $this->assertCount(1, $this->satisfiedEvents());
        $this->assertNotNull($interest->fresh()->notified_at);
    }

    public function test_updated_area_also_expands(): void
    {
        $area = ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);
        $interest = $this->interest(self::HOLY_SPIRIT);
        $this->fire($area);
        $this->assertNull($interest->fresh()->notified_at);

        $area->update(['geo' => ['admin_areas' => [self::MARIKINA, self::QC]]]);
        $this->fire($area->fresh(), 'ServiceManagement.ServiceAreaUpdated');

        $this->assertCount(1, $this->satisfiedEvents());
        $this->assertNotNull($interest->fresh()->notified_at);
    }

    public function test_deleted_area_before_consume_is_a_noop(): void
    {
        $this->interest(self::HOLY_SPIRIT);
        $area = ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'QC zone',
            'geo' => ['admin_areas' => [self::QC]],
        ]);
        $area->delete();

        $this->fire($area);
        $this->assertCount(0, $this->satisfiedEvents());
    }

    public function test_fulfilled_interest_leaves_the_demand_list_and_resubscription_rearms(): void
    {
        // Declare coverage leaving Holy Spirit outside, register interest
        // over HTTP (needs a token), fulfil it, then re-subscribe.
        ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'Marikina zone',
            'geo' => ['admin_areas' => [self::MARIKINA]],
        ]);
        $sub = (string) Uuid::uuid7();
        $token = JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => $sub, 'tenant_id' => $this->tenant,
            'roles' => [], 'permissions' => ['catalog.services.manage'],
            'jti' => (string) Uuid::uuid7(), 'iat' => time(), 'exp' => time() + 3600,
        ], $this->privateKey, 'RS256');

        $this->withToken($token)->postJson("/api/v1/tenants/{$this->tenant}/coverage/interest", [
            'admin_code' => self::HOLY_SPIRIT,
        ])->assertStatus(201);

        $area = ServiceArea::create([
            'tenant_id' => $this->tenant, 'name' => 'QC zone',
            'geo' => ['admin_areas' => [self::QC]],
        ]);
        $this->fire($area);

        // Fulfilled → off the demand list.
        $this->withToken($token)
            ->getJson("/api/v1/tenants/{$this->tenant}/coverage/interest")
            ->assertOk()->assertJsonCount(0, 'data');

        // Coverage shrinks → customer is outside again → re-registering
        // rearms the interest for the next expansion.
        $area->delete();
        $this->withToken($token)->postJson("/api/v1/tenants/{$this->tenant}/coverage/interest", [
            'admin_code' => self::HOLY_SPIRIT,
        ])->assertOk();

        $interest = CoverageInterest::where('user_id', $sub)->sole();
        $this->assertNull($interest->notified_at);
        $this->withToken($token)
            ->getJson("/api/v1/tenants/{$this->tenant}/coverage/interest")
            ->assertOk()->assertJsonCount(1, 'data');
    }
}
