<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Support\TenantContext;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * ADR-0028 — Postgres RLS is the fail-closed net under application-level
 * tenant scoping. These assertions only mean anything on a real Postgres
 * connection; sqlite has no RLS so the suite skips there. Live-stack
 * verification is the intended path for this test.
 */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $other;

    protected function setUp(): void
    {
        parent::setUp();
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('RLS is Postgres-only — run against the live stack DB');
        }
        $this->tenant = (string) Str::uuid7();
        $this->other = (string) Str::uuid7();
    }

    private function token(string $tenant): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $tenant,
            'roles' => ['Dispatcher'], 'jti' => (string) Str::uuid(),
            'permissions' => ['billing.payments.record', 'billing.remit'],
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    public function test_unscoped_query_sees_only_the_pinned_tenant(): void
    {
        TenantContext::asSystem(); // seed across tenants
        Invoice::create(['job_id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'status' => 'issued', 'amount_cents' => 100]);
        Invoice::create(['job_id' => (string) Str::uuid7(), 'tenant_id' => $this->other,
            'status' => 'issued', 'amount_cents' => 200]);

        // The net: a query with NO where(tenant_id) still sees only the
        // pinned tenant — the app-layer scope is defence, not the only wall.
        TenantContext::asTenant($this->tenant);
        $this->assertSame(1, Invoice::query()->count());
        $this->assertSame($this->tenant, Invoice::query()->first()->tenant_id);

        // And the WITH CHECK half: a tenant-pinned connection cannot even
        // write a row belonging to someone else.
        $this->expectException(\Illuminate\Database\QueryException::class);
        Invoice::create(['job_id' => (string) Str::uuid7(), 'tenant_id' => $this->other,
            'status' => 'issued', 'amount_cents' => 300]);
    }

    public function test_request_middleware_pins_the_connection(): void
    {
        TenantContext::asSystem();
        Invoice::create(['job_id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'status' => 'issued', 'amount_cents' => 100]);
        Invoice::create(['job_id' => (string) Str::uuid7(), 'tenant_id' => $this->other,
            'status' => 'issued', 'amount_cents' => 200]);

        $this->withToken($this->token($this->tenant))
            ->json('GET', "/api/v1/tenants/{$this->tenant}/invoices")
            ->assertOk();

        // The middleware set the GUC on this shared connection — after the
        // request, raw unscoped reads stay inside the tenant boundary.
        $this->assertSame(1, DB::table('invoices')->count());
    }
}
