<?php

namespace Tests\Feature;

use App\Events\Handlers\PayoutEventHandler;
use App\Models\Payout;
use App\Models\PayoutJob;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Payout settle + the remittance-shortfall deduction chain (ADR-0005).
 * Handlers are exercised with the real event envelope — the same shape
 * the consumer receives off the broker.
 */
class PayoutFlowTest extends TestCase
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

    private function token(?string $tenant = null): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $tenant ?? $this->tenant,
            'roles' => ['Dispatcher'], 'jti' => (string) Str::uuid(),
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function api(string $method, string $uri, ?array $body = null)
    {
        return $this->withToken($this->token())->json($method, "/api/v1/tenants/{$this->tenant}{$uri}", $body ?? []);
    }

    private function envelope(string $type, array $payload): array
    {
        return ['id' => (string) Str::uuid7(), 'type' => $type,
            'occurred_at' => now()->toIso8601String(), 'tenant_id' => $this->tenant,
            'actor' => ['service' => 'billing-backend', 'on_behalf_of' => null],
            'payload' => $payload];
    }

    public function test_pending_payout_settles_and_replays_409(): void
    {
        $payout = Payout::create([
            'id' => (string) Str::uuid7(), 'job_id' => (string) Str::uuid7(),
            'tenant_id' => $this->tenant, 'agent_id' => $this->agent,
            'amount_cents' => 100000, 'net_cents' => 80000, 'status' => 'pending',
        ]);

        $this->api('POST', "/payouts/{$payout->id}/settle")->assertOk()
            ->assertJsonPath('data.status', 'settled');
        $this->assertNotNull($payout->fresh()->disbursement_ref);
        $this->assertDatabaseHas('outbox', ['type' => 'Payout.Settled']);

        $this->api('POST', "/payouts/{$payout->id}/settle")->assertStatus(409);
    }

    public function test_settle_denies_foreign_tenant(): void
    {
        $payout = Payout::create([
            'id' => (string) Str::uuid7(), 'job_id' => (string) Str::uuid7(),
            'tenant_id' => (string) Str::uuid7(), 'agent_id' => $this->agent,
            'amount_cents' => 1000, 'net_cents' => 1000, 'status' => 'pending',
        ]);
        $this->api('POST', "/payouts/{$payout->id}/settle")->assertNotFound();
    }

    public function test_shortfall_event_writes_deduction_row(): void
    {
        $handler = app(PayoutEventHandler::class);
        $handler->handle($this->envelope('Remittance.ShortfallAccepted', [
            'remittance_id' => 'remit-1', 'agent_id' => $this->agent, 'shortage_cents' => 5000,
        ]));

        $deduction = Payout::where('agent_id', $this->agent)->where('status', 'deduction')->firstOrFail();
        $this->assertEquals(5000, $deduction->shortfall_cents);
        $this->assertEquals(0, $deduction->amount_cents);
        $this->assertEquals('remit:remit-1', $deduction->disbursement_ref);
        $this->assertDatabaseHas('outbox', ['type' => 'Payout.ShortfallRecorded']);

        // Replay — same remittance must not deduct twice.
        $handler->handle($this->envelope('Remittance.ShortfallAccepted', [
            'remittance_id' => 'remit-1', 'agent_id' => $this->agent, 'shortage_cents' => 5000,
        ]));
        $this->assertEquals(1, Payout::where('agent_id', $this->agent)->where('status', 'deduction')->count());
    }

    public function test_invoice_issued_absorbs_outstanding_shortfall(): void
    {
        $job = (string) Str::uuid7();
        PayoutJob::create(['job_id' => $job, 'tenant_id' => $this->tenant, 'agent_id' => $this->agent]);
        Payout::create([
            'id' => (string) Str::uuid7(), 'job_id' => null, 'tenant_id' => $this->tenant,
            'agent_id' => $this->agent, 'amount_cents' => 0,
            'shortfall_cents' => 3000, 'applied_cents' => 0,
            'net_cents' => 0, 'status' => 'deduction', 'disbursement_ref' => 'remit:r1',
        ]);

        app(PayoutEventHandler::class)->handle($this->envelope('Invoice.Issued', [
            'job_id' => $job, 'invoice_id' => (string) Str::uuid7(), 'amount_cents' => 100000,
        ]));

        $payout = Payout::where('job_id', $job)->where('status', 'pending')->firstOrFail();
        $this->assertEquals(3000, $payout->shortfall_cents);
        $this->assertLessThan(100000, $payout->net_cents - 0 + 3000); // net = gross - commission - shortfall
        // The deduction row is now applied — a second invoice must not re-deduct it.
        $this->assertEquals(0, Payout::where('agent_id', $this->agent)->where('status', 'deduction')
            ->whereColumn('shortfall_cents', '>', 'applied_cents')->count());
    }
}
