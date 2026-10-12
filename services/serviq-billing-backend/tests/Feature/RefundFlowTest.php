<?php

namespace Tests\Feature;

use App\Events\Handlers\BillingEventHandler;
use App\Models\Invoice;
use App\Models\RefundRequest;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * ADR-0004 refund chain: request → Support.RefundDecided approves →
 * gated execute → invoice refunded. Support decides, Billing executes.
 */
class RefundFlowTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $dispatcher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = (string) Str::uuid7();
        $this->dispatcher = (string) Str::uuid7();
    }

    private function token(array $roles = ['Dispatcher'], array $permissions = ['billing.payments.record', 'billing.remit']): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => $this->dispatcher, 'tenant_id' => $this->tenant,
            'roles' => $roles, 'permissions' => $permissions,
            'jti' => (string) Str::uuid(), 'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function api(string $method, string $uri, ?array $body = null, array $token = []): \Illuminate\Testing\TestResponse
    {
        return $this->withToken($this->token(...$token))->json(
            $method, "/api/v1/tenants/{$this->tenant}{$uri}", $body ?? []);
    }

    private function paidInvoice(): Invoice
    {
        $invoice = Invoice::create([
            'id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'job_id' => (string) Str::uuid7(), 'amount_cents' => 150000,
            'status' => Invoice::PAID, 'agent_id' => (string) Str::uuid7(),
        ]);
        return $invoice;
    }

    private function decide(Invoice $invoice, string $decision = 'approved'): void
    {
        app(BillingEventHandler::class)->handle([
            'id' => (string) Str::uuid7(), 'type' => 'Support.RefundDecided',
            'occurred_at' => now()->toIso8601String(), 'tenant_id' => $this->tenant,
            'actor' => ['service' => 'customer-support-backend', 'on_behalf_of' => null],
            'payload' => [
                'decision_id' => (string) Str::uuid7(), 'invoice_id' => $invoice->id,
                'amount_cents' => $invoice->amount_cents, 'reason' => 'not satisfied',
                'decided_by' => (string) Str::uuid7(),
            ],
        ]);
    }

    public function test_refund_request_lifecycle(): void
    {
        $invoice = $this->paidInvoice();

        $r = $this->api('POST', '/refund-requests', [
            'invoice_id' => $invoice->id, 'reason' => 'not satisfied',
        ]);
        $r->assertStatus(201);
        $requestId = $r->json('data.id');
        $this->assertDatabaseHas('outbox', ['type' => 'Billing.RefundRequested']);

        // Support decision → pending request approved via the event.
        $this->decide($invoice);
        $request = RefundRequest::findOrFail($requestId);
        $this->assertEquals(RefundRequest::APPROVED, $request->status);

        // Execute requires the finance gate — dispatcher alone is not enough.
        $this->api('POST', "/refund-requests/{$requestId}/execute")->assertStatus(403);

        // Tenant admin (fallback authority) executes.
        $this->api('POST', "/refund-requests/{$requestId}/execute", null, [
            'roles' => ['Tenant Administrator'],
        ])->assertOk();

        $this->assertEquals(RefundRequest::EXECUTED, $request->fresh()->status);
        $this->assertEquals(Invoice::REFUNDED, $invoice->fresh()->status);
        $this->assertDatabaseHas('outbox', ['type' => 'Billing.RefundExecuted']);
        $this->assertDatabaseHas('outbox', ['type' => 'Invoice.Refunded']);
    }

    public function test_execute_rejects_unapproved_and_repeats(): void
    {
        $invoice = $this->paidInvoice();
        $r = $this->api('POST', '/refund-requests', [
            'invoice_id' => $invoice->id, 'reason' => 'test',
        ]);
        $requestId = $r->json('data.id');

        // Still pending — can't execute even with the right role.
        $this->api('POST', "/refund-requests/{$requestId}/execute", null, [
            'roles' => ['Tenant Administrator'],
        ])->assertStatus(409);

        $this->decide($invoice);
        $this->api('POST', "/refund-requests/{$requestId}/execute", null, [
            'roles' => ['Tenant Administrator'],
        ])->assertOk();

        // Second execute → 409 (executed).
        $this->api('POST', "/refund-requests/{$requestId}/execute", null, [
            'roles' => ['Tenant Administrator'],
        ])->assertStatus(409);
    }

    public function test_request_rejects_refunded_invoice(): void
    {
        // Refund requests are allowed on issued (unpaid) invoices too —
        // the complaint can precede payment.
        $invoice = Invoice::create([
            'id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'job_id' => (string) Str::uuid7(), 'amount_cents' => 1000,
            'status' => Invoice::ISSUED,
        ]);
        $this->api('POST', '/refund-requests', [
            'invoice_id' => $invoice->id, 'reason' => 'x',
        ])->assertStatus(201);

        $invoice->update(['status' => Invoice::REFUNDED]);
        $this->api('POST', '/refund-requests', [
            'invoice_id' => $invoice->id, 'reason' => 'x',
        ])->assertStatus(409);
    }

    public function test_evidence_review_accept_records_payment_reject_does_not(): void
    {
        $invoice = $this->paidInvoice();
        $invoice->update(['status' => Invoice::ISSUED]);

        // Review acts only on flagged evidence — low confidence lands it there.
        $flagged = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'minio://ev/1',
            'confidence' => 0.4, 'invoice_id' => $invoice->id,
            'extracted' => ['reference' => 'REV-1', 'amount_cents' => $invoice->amount_cents],
        ]);
        $flagged->assertStatus(201)->assertJsonPath('data.status', 'flagged');
        $id = $flagged->json('data.id');

        $this->api('POST', "/payment-evidence/{$id}/review", ['decision' => 'accept'])
            ->assertOk();
        $this->assertEquals(Invoice::PAID, $invoice->fresh()->status);
        $this->assertDatabaseHas('outbox', ['type' => 'PaymentEvidence.Reviewed']);

        // Already-decided evidence can't be reviewed again.
        $this->api('POST', "/payment-evidence/{$id}/review", ['decision' => 'accept'])
            ->assertStatus(409);

        // Rejected flagged evidence records no payment.
        $invoice->refresh(); // request moved DB to paid — in-memory model is stale
        $invoice->update(['status' => Invoice::ISSUED]);
        $flagged2 = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'minio://ev/2',
            'confidence' => 0.4,
            'extracted' => ['reference' => 'REV-2', 'amount_cents' => 1000],
        ]);
        $flag2Id = $flagged2->json('data.id');
        $this->api('POST', "/payment-evidence/{$flag2Id}/review", ['decision' => 'reject'])
            ->assertOk();
        $this->assertEquals(0, DB::table('payments')->where('evidence_id', $flag2Id)->count());
        $this->assertEquals(Invoice::ISSUED, $invoice->fresh()->status);
    }
}
