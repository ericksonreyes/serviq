<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\OutboxEvent;
use App\Services\DomainEventRecorder;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

/**
 * EVENT_DELIVERY.MD: invoice state, its event stream and the outbox row
 * commit in one transaction — an outbox failure leaves no payment behind.
 */
class OutboxAtomicityTest extends TestCase
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
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function invoice(): Invoice
    {
        return Invoice::create([
            'job_id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'customer_id' => (string) Str::uuid7(), 'agent_id' => (string) Str::uuid7(),
            'status' => 'issued', 'amount_cents' => 50000,
        ]);
    }

    private function pay(Invoice $invoice)
    {
        return $this->withToken($this->token())
            ->postJson("/api/v1/tenants/{$this->tenant}/invoices/{$invoice->id}/pay", ['method' => 'cash']);
    }

    public function test_payment_commits_with_its_outbox_row(): void
    {
        $invoice = $this->invoice();

        $this->pay($invoice)->assertCreated();

        $this->assertSame('paid', $invoice->fresh()->status);
        $this->assertSame(1, DB::table('payments')->where('invoice_id', $invoice->id)->count());
        $this->assertSame(1, OutboxEvent::where('type', 'Invoice.PaymentRecorded')->count());
    }

    public function test_outbox_failure_rolls_back_the_payment(): void
    {
        $invoice = $this->invoice();
        $this->app->instance(DomainEventRecorder::class, new class extends DomainEventRecorder
        {
            public function record(string $type, array $payload, ?string $tenantId = null): OutboxEvent
            {
                throw new RuntimeException('outbox insert failed');
            }
        });

        $this->pay($invoice)->assertStatus(500);

        $this->assertSame('issued', $invoice->fresh()->status);
        $this->assertSame(0, DB::table('payments')->where('invoice_id', $invoice->id)->count());
        $this->assertSame(0, DB::table('invoice_events')->where('invoice_id', $invoice->id)->count());
        $this->assertSame(0, OutboxEvent::count());
    }
}
