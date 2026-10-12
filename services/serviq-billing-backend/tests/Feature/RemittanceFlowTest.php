<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\PaymentEvidence;
use App\Models\Remittance;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * CASH_REMITTANCE.MD / BILLING.MD flow coverage: evidence guardrails,
 * cash turn-in confirm paths, deposit-slip batches, digital bulk remit.
 * Exercises the real HTTP kernel — mints HS256 tokens (test fallback).
 */
class RemittanceFlowTest extends TestCase
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

    private function token(): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Dispatcher'], 'jti' => (string) Str::uuid(),
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function api(string $method, string $uri, ?array $body = null)
    {
        return $this->withToken($this->token())->json($method, "/api/v1/tenants/{$this->tenant}{$uri}", $body ?? []);
    }

    private function invoice(?string $agent, int $cents): Invoice
    {
        return Invoice::create([
            'job_id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'customer_id' => (string) Str::uuid7(), 'agent_id' => $agent,
            'status' => 'issued', 'amount_cents' => $cents,
        ]);
    }

    private function paidCash(Invoice $invoice): void
    {
        $this->api('POST', "/invoices/{$invoice->id}/pay", ['method' => 'cash'])->assertCreated();
    }

    public function test_evidence_accepts_and_pays_invoice(): void
    {
        $invoice = $this->invoice(null, 150000);

        $r = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'minio://e/1', 'confidence' => 0.95,
            'invoice_id' => $invoice->id,
            'extracted' => ['reference' => 'GC-1', 'amount_cents' => 150000],
        ]);

        $r->assertCreated()->assertJsonPath('data.status', 'accepted');
        $this->assertSame('paid', $invoice->fresh()->status);
    }

    public function test_evidence_guardrails_flag_anomalies(): void
    {
        $invoice = $this->invoice(null, 150000);
        $this->api('POST', "/invoices/{$invoice->id}/pay", ['method' => 'wallet', 'reference' => 'DUP-1'])->assertCreated();

        $dup = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'minio://e/2', 'confidence' => 0.9,
            'extracted' => ['reference' => 'DUP-1', 'amount_cents' => 150000],
        ]);
        $dup->assertCreated()->assertJsonPath('data.status', 'flagged');
        $this->assertContains('duplicate_reference', $dup->json('data.flags'));

        $short = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'minio://e/3', 'confidence' => 0.9,
            'invoice_id' => $this->invoice(null, 150000)->id,
            'extracted' => ['reference' => 'GC-2', 'amount_cents' => 100000],
        ]);
        $this->assertContains('under_remitted', $short->json('data.flags'));
    }

    public function test_flagged_evidence_review_path(): void
    {
        $evidence = PaymentEvidence::create([
            'tenant_id' => $this->tenant, 'document_type' => 'E_WALLET', 'file_ref' => 'x',
            'extracted' => ['reference' => 'R', 'amount_cents' => 1],
            'status' => 'flagged', 'flags' => ['low_confidence'], 'confidence' => 0.2,
        ]);

        $r = $this->api('POST', "/payment-evidence/{$evidence->id}/review", ['decision' => 'accept']);
        $r->assertOk()->assertJsonPath('data.status', 'accepted');
        $this->assertNotNull($evidence->fresh()->reviewed_by);
    }

    public function test_turn_in_matched_confirms_remitted(): void
    {
        $a = $this->invoice($this->agent, 150000);
        $b = $this->invoice($this->agent, 100000);
        $this->paidCash($a);
        $this->paidCash($b);

        $this->api('GET', "/remittances/expected?agent_id={$this->agent}")
            ->assertOk()->assertJsonPath('data.expected_cents', 250000);

        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'counted_total_cents' => 250000,
        ])->assertCreated();

        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertOk()->assertJsonPath('data.status', 'remitted');
        $this->assertSame('remitted', $a->fresh()->status);
        $this->assertSame('remitted', $b->fresh()->status);
    }

    public function test_turn_in_shortfall_emits_payouts_event(): void
    {
        $invoice = $this->invoice($this->agent, 200000);
        $this->paidCash($invoice);

        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'counted_total_cents' => 190000,
        ])->assertCreated();

        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertStatus(422);
        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'accept_shortfall'])
            ->assertOk()->assertJsonPath('data.status', 'remitted');

        $this->assertDatabaseHas('outbox', ['type' => 'Remittance.ShortfallAccepted']);
    }

    public function test_deposit_slip_batch_and_duplicate_reference_guard(): void
    {
        $a = $this->invoice($this->agent, 80000);
        $b = $this->invoice($this->agent, 70000);
        $this->paidCash($a);
        $this->paidCash($b);

        $slip = $this->api('POST', '/payment-evidence', [
            'document_type' => 'BANK_SLIP', 'file_ref' => 'minio://s/1', 'confidence' => 0.97,
            'extracted' => ['reference' => 'DEP-1', 'amount_cents' => 150000],
        ])->assertCreated();

        $batch = $this->api('POST', '/remittances/batches', [
            'evidence_id' => $slip->json('data.id'), 'invoice_ids' => [$a->id, $b->id],
        ])->assertCreated()->assertJsonPath('data.status', 'pending_confirmation');

        $this->api('POST', "/remittances/{$batch->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertOk()->assertJsonPath('data.status', 'remitted');

        // Reusing the same slip reference routes the next batch to manual review.
        $c = $this->invoice($this->agent, 40000);
        $this->paidCash($c);
        $reuse = $this->api('POST', '/remittances/batches', [
            'evidence_id' => $slip->json('data.id'), 'invoice_ids' => [$c->id],
        ])->assertCreated()->assertJsonPath('data.status', 'manual_review');
        $this->assertContains('duplicate_reference', $reuse->json('data.flags'));
    }

    public function test_digital_bulk_remit_rejects_cash(): void
    {
        $wallet = $this->invoice(null, 90000);
        $this->api('POST', "/invoices/{$wallet->id}/pay", ['method' => 'wallet', 'reference' => 'W-1'])->assertCreated();
        $cash = $this->invoice(null, 30000);
        $this->paidCash($cash);

        $this->api('POST', '/remittances/digital', ['invoice_ids' => [$wallet->id]])
            ->assertCreated()->assertJsonPath('data.status', 'remitted');
        $this->api('POST', '/remittances/digital', ['invoice_ids' => [$cash->id]])->assertStatus(422);
    }

    public function test_invoices_filter_by_job_and_reject_malformed_job_ids(): void
    {
        $mine = $this->invoice($this->agent, 1500);
        $this->invoice($this->agent, 900);

        $this->api('GET', "/invoices?job_id={$mine->job_id}")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $mine->id);
        $this->api('GET', '/invoices?job_id=not-a-uuid')->assertStatus(422);
    }

    public function test_remittance_center_receipt_closes_a_deposit_batch_but_an_ewallet_receipt_cannot(): void
    {
        $a = $this->invoice($this->agent, 150000);
        $this->paidCash($a);

        $wallet = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'agent-deposit:w.jpg',
            'extracted' => ['reference' => 'W-9', 'amount_cents' => 150000],
        ])->assertCreated();
        $this->api('POST', '/remittances/batches', [
            'evidence_id' => $wallet->json('data.id'), 'invoice_ids' => [$a->id],
        ])->assertStatus(422);

        $receipt = $this->api('POST', '/payment-evidence', [
            'document_type' => 'REMITTANCE_RECEIPT', 'file_ref' => 'agent-deposit:r.jpg',
            'extracted' => ['reference' => 'RC-1', 'amount_cents' => 150000],
        ])->assertCreated();
        $batch = $this->api('POST', '/remittances/batches', [
            'evidence_id' => $receipt->json('data.id'), 'invoice_ids' => [$a->id],
        ])->assertCreated()->assertJsonPath('data.status', 'pending_confirmation');
        $this->api('POST', "/remittances/{$batch->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertOk()->assertJsonPath('data.status', 'remitted');

        $this->api('POST', '/payment-evidence', [
            'document_type' => 'REMITTANCE_RECEIPT', 'file_ref' => 'agent-deposit:x.jpg',
            'extracted' => ['amount_cents' => 100],
        ])->assertStatus(422);
    }
}
