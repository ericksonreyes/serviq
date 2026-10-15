<?php

namespace Tests\Feature;

use App\Models\CompanyAccount;
use App\Models\Invoice;
use App\Models\PaymentEvidence;
use App\Models\RefundRequest;
use App\Models\Remittance;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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
            'permissions' => ['billing.payments.record', 'billing.remit'],
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function api(string $method, string $uri, ?array $body = null)
    {
        return $this->withToken($this->token())->json($method, "/api/v1/tenants/{$this->tenant}{$uri}", $body ?? []);
    }

    /** Agent-scoped token — intake writes only, no dispatcher decisions. */
    private function agentToken(): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Service Agent'], 'jti' => (string) Str::uuid(),
            'permissions' => ['billing.payments.record'],
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
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

    /**
     * Refund intake is tenant-scoped — the chatbot's refund_request tool
     * forwards a *customer* JWT verbatim, and BILLING.MD scopes requesting
     * to "anyone tenant-scoped". The dispatcher-only billing.remit gate
     * belongs on execute (actual money movement), not on intake.
     */
    public function test_refund_request_intake_is_tenant_scoped_but_execute_stays_gated(): void
    {
        $invoice = $this->invoice($this->agent, 150000);

        $customer = JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Customer'], 'jti' => (string) Str::uuid(),
            'permissions' => [], 'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');

        $this->withToken($customer)
            ->postJson("/api/v1/tenants/{$this->tenant}/refund-requests", [
                'invoice_id' => $invoice->id, 'reason' => 'Service was late',
            ])
            ->assertCreated();

        $refund = RefundRequest::where('invoice_id', $invoice->id)->sole();
        $this->withToken($customer)
            ->postJson("/api/v1/tenants/{$this->tenant}/refund-requests/{$refund->id}/execute")
            ->assertForbidden();
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

    public function test_turn_in_items_cannot_be_remitted_twice(): void
    {
        $invoice = $this->invoice($this->agent, 150000);
        $this->paidCash($invoice);

        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'counted_total_cents' => 150000,
        ])->assertCreated();

        // Once attached to a live remittance the cash is spoken for —
        // a second turn-in must find nothing pending.
        $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'counted_total_cents' => 150000,
        ])->assertStatus(422);
        $this->api('GET', "/remittances/expected?agent_id={$this->agent}")
            ->assertOk()->assertJsonPath('data.expected_cents', 0);

        // Rejection releases the items — a corrected turn-in can retry.
        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'reject'])
            ->assertOk()->assertJsonPath('data.status', 'rejected');
        $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'counted_total_cents' => 150000,
        ])->assertCreated();
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
    }

    // The agent BFF relays OTC deposits with the agent's own JWT — intake
    // is billing.payments.record, not the dispatcher-decision remit scope.
    public function test_agent_token_can_submit_a_deposit_batch(): void
    {
        $invoice = $this->invoice($this->agent, 150000);
        $this->paidCash($invoice);

        $slip = $this->api('POST', '/payment-evidence', [
            'document_type' => 'BANK_SLIP', 'file_ref' => 'minio://s/agent', 'confidence' => 0.97,
            'extracted' => ['reference' => 'DEP-AGT', 'amount_cents' => 150000],
        ])->assertCreated();

        $this->withToken($this->agentToken())
            ->json('POST', "/api/v1/tenants/{$this->tenant}/remittances/batches", [
                'evidence_id' => $slip->json('data.id'), 'invoice_ids' => [$invoice->id],
            ])
            ->assertCreated()->assertJsonPath('data.status', 'pending_confirmation');
    }

    public function test_agent_token_cannot_decide_a_remittance(): void
    {
        $invoice = $this->invoice($this->agent, 150000);
        $this->paidCash($invoice);

        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'counted_total_cents' => 150000,
        ])->assertCreated();

        $this->withToken($this->agentToken())
            ->json('POST', "/api/v1/tenants/{$this->tenant}/remittances/{$turn->json('data.id')}/confirm", [
                'decision' => 'confirm',
            ])
            ->assertForbidden();
    }

    public function test_deposit_batch_duplicate_reference_guard(): void
    {
        $a = $this->invoice($this->agent, 80000);
        $b = $this->invoice($this->agent, 70000);
        $this->paidCash($a);
        $this->paidCash($b);

        $slip = $this->api('POST', '/payment-evidence', [
            'document_type' => 'BANK_SLIP', 'file_ref' => 'minio://s/1', 'confidence' => 0.97,
            'extracted' => ['reference' => 'DEP-1', 'amount_cents' => 150000],
        ])->assertCreated();

        $this->api('POST', '/remittances/batches', [
            'evidence_id' => $slip->json('data.id'), 'invoice_ids' => [$a->id, $b->id],
        ])->assertCreated()->assertJsonPath('data.status', 'pending_confirmation');

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

    public function test_claimed_values_mismatching_parsed_fields_flag_the_evidence(): void
    {
        $invoice = $this->invoice(null, 150000);

        $r = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'minio://e/claimed', 'confidence' => 0.95,
            'invoice_id' => $invoice->id,
            'extracted' => ['reference' => 'GC-REAL-1', 'amount_cents' => 150000],
            'claimed' => ['reference' => 'GC-TYPED-WRONG', 'amount_cents' => 150000],
        ]);

        $r->assertCreated()->assertJsonPath('data.status', 'flagged');
        $this->assertContains('claimed_mismatch', $r->json('data.flags'));
    }

    public function test_under_expected_batch_lands_in_manual_review(): void
    {
        $a = $this->invoice($this->agent, 90000);
        $b = $this->invoice($this->agent, 60000);
        $this->paidCash($a);
        $this->paidCash($b);

        // The slip covers less than the invoices it claims to settle.
        $slip = $this->api('POST', '/payment-evidence', [
            'document_type' => 'BANK_SLIP', 'file_ref' => 'minio://s/short', 'confidence' => 0.97,
            'extracted' => ['reference' => 'DEP-SHORT', 'amount_cents' => 140000],
        ])->assertCreated();

        $batch = $this->api('POST', '/remittances/batches', [
            'evidence_id' => $slip->json('data.id'), 'invoice_ids' => [$a->id, $b->id],
        ])->assertCreated()->assertJsonPath('data.status', 'manual_review');

        $this->assertContains('under_remitted', $batch->json('data.flags'));
        // Flagged batches cannot reach remitted through a plain confirm.
        $this->api('POST', "/remittances/{$batch->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertStatus(422);
    }

    public function test_paid_invoice_never_settles_itself(): void
    {
        $invoice = $this->invoice($this->agent, 150000);
        $this->paidCash($invoice);

        // `paid` is where an invoice waits for a remittance — nothing in the
        // payment path may push it to `remitted` on its own.
        $this->assertSame('paid', $invoice->fresh()->status);
        $this->assertDatabaseMissing('remittances', ['status' => 'remitted']);
    }

    // ── ADR-0026: e-wallet turn-ins ──────────────────────────────────────

    private function paidWalletToAgent(Invoice $invoice): void
    {
        $this->api('POST', "/invoices/{$invoice->id}/pay",
            ['method' => 'wallet', 'holder' => 'agent', 'reference' => (string) Str::uuid()])->assertCreated();
    }

    private function walletReceipt(int $cents, string $reference): string
    {
        return $this->receipt('E_WALLET', $cents, $reference);
    }

    private function receipt(string $docType, int $cents, string $reference): string
    {
        return $this->api('POST', '/payment-evidence', [
            'document_type' => $docType, 'file_ref' => 'agent-turnin:r.jpg', 'confidence' => 0.95,
            'extracted' => ['reference' => $reference, 'amount_cents' => $cents],
        ])->assertCreated()->json('data.id');
    }

    public function test_wallet_turn_in_covers_all_agent_held_collections(): void
    {
        $cash = $this->invoice($this->agent, 150000);
        $this->paidCash($cash);
        $walletToAgent = $this->invoice($this->agent, 80000);
        $this->paidWalletToAgent($walletToAgent);
        $walletToCompany = $this->invoice($this->agent, 50000);
        $this->api('POST', "/invoices/{$walletToCompany->id}/pay",
            ['method' => 'wallet', 'holder' => 'company', 'reference' => 'C-1'])->assertCreated();

        $this->api('GET', "/remittances/expected?agent_id={$this->agent}")->assertOk()
            ->assertJsonPath('data.expected_cents', 150000)
            ->assertJsonPath('data.wallet_expected_cents', 230000);

        $evidenceId = $this->walletReceipt(230000, 'GC-TURN-1');
        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'channel' => 'wallet', 'evidence_id' => $evidenceId,
        ])->assertCreated();

        $turn->assertJsonPath('data.channel', 'wallet')
            ->assertJsonPath('data.status', 'manual_review')
            ->assertJsonPath('data.counted_cents', 230000)
            ->assertJsonPath('data.variance_cents', 0)
            ->assertJsonPath('data.reference', 'GC-TURN-1');
        $this->assertSame(['wallet_transfer'], $turn->json('data.flags'));

        // Arrival verified → a clean wallet turn-in confirms, and both
        // agent-held legs remit; the company-held invoice is untouched.
        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertOk()->assertJsonPath('data.status', 'remitted');
        $this->assertSame('remitted', $cash->fresh()->status);
        $this->assertSame('remitted', $walletToAgent->fresh()->status);
        $this->assertSame('paid', $walletToCompany->fresh()->status);
    }

    public function test_wallet_turn_in_receipt_reference_is_deduped(): void
    {
        $invoice = $this->invoice($this->agent, 100000);
        $this->paidCash($invoice);
        // A payment already carries this reference — the receipt is a reuse.
        $this->api('POST', "/invoices/{$this->invoice(null, 1)->id}/pay",
            ['method' => 'wallet', 'reference' => 'GC-SEEN'])->assertCreated();

        $evidenceId = $this->walletReceipt(100000, 'GC-SEEN');
        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'channel' => 'wallet', 'evidence_id' => $evidenceId,
        ])->assertCreated()->assertJsonPath('data.status', 'manual_review');

        $this->assertContains('duplicate_reference', $turn->json('data.flags'));
        // An anomaly flag blocks a plain confirm — override or reject only.
        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertStatus(422);
    }

    public function test_wallet_turn_in_shortfall_uses_variance_path(): void
    {
        $invoice = $this->invoice($this->agent, 100000);
        $this->paidCash($invoice);

        $evidenceId = $this->walletReceipt(90000, 'GC-SHORT');
        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'channel' => 'wallet', 'evidence_id' => $evidenceId,
        ])->assertCreated()->assertJsonPath('data.variance_cents', -10000);
        $this->assertContains('under_remitted', $turn->json('data.flags'));

        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'accept_shortfall'])
            ->assertOk()->assertJsonPath('data.status', 'remitted');
        $this->assertDatabaseHas('outbox', ['type' => 'Remittance.ShortfallAccepted']);
    }

    public function test_wallet_turn_in_requires_ewallet_evidence(): void
    {
        $invoice = $this->invoice($this->agent, 100000);
        $this->paidCash($invoice);

        $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'channel' => 'wallet',
        ])->assertStatus(422); // evidence_id required

        $slip = $this->api('POST', '/payment-evidence', [
            'document_type' => 'BANK_SLIP', 'file_ref' => 'x', 'confidence' => 0.95,
            'extracted' => ['reference' => 'DEP-9', 'amount_cents' => 100000],
        ])->assertCreated();
        $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'channel' => 'wallet', 'evidence_id' => $slip->json('data.id'),
        ])->assertStatus(422); // not a wallet receipt
    }

    /** ADR-0027 — the agent can also settle held collections by bank deposit
     *  or remittance center; the slip/receipt is the claim, same as wallet. */
    public function test_bank_deposit_turn_in_settles_agent_held_collections(): void
    {
        $cash = $this->invoice($this->agent, 150000);
        $this->paidCash($cash);
        $wallet = $this->invoice($this->agent, 80000);
        $this->paidWalletToAgent($wallet);

        $evidenceId = $this->receipt('BANK_SLIP', 230000, 'DEP-TURN-1');
        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'channel' => 'bank', 'evidence_id' => $evidenceId,
        ])->assertCreated();

        $turn->assertJsonPath('data.channel', 'bank')
            ->assertJsonPath('data.status', 'manual_review')
            ->assertJsonPath('data.counted_cents', 230000)
            ->assertJsonPath('data.reference', 'DEP-TURN-1');
        $this->assertSame(['bank_transfer'], $turn->json('data.flags'));

        // A clean transfer turn-in confirms once the deposit is verified.
        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertOk()->assertJsonPath('data.status', 'remitted');
        $this->assertSame('remitted', $cash->fresh()->status);
        $this->assertSame('remitted', $wallet->fresh()->status);
    }

    public function test_remittance_center_turn_in_settles_agent_held_collections(): void
    {
        $invoice = $this->invoice($this->agent, 120000);
        $this->paidCash($invoice);

        $evidenceId = $this->receipt('REMITTANCE_RECEIPT', 120000, 'PAL-8877');
        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'channel' => 'remittance_center', 'evidence_id' => $evidenceId,
        ])->assertCreated();

        $turn->assertJsonPath('data.channel', 'remittance_center')
            ->assertJsonPath('data.status', 'manual_review')
            ->assertJsonPath('data.reference', 'PAL-8877');
        $this->assertSame(['remittance_transfer'], $turn->json('data.flags'));
    }

    public function test_transfer_turn_in_rejects_the_wrong_evidence_type(): void
    {
        $invoice = $this->invoice($this->agent, 100000);
        $this->paidCash($invoice);

        // A bank turn-in can't ride on an e-wallet receipt — the rail must
        // match the document the agent actually presents.
        $walletEvidenceId = $this->walletReceipt(100000, 'GC-WRONG-RAIL');
        $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'channel' => 'bank', 'evidence_id' => $walletEvidenceId,
        ])->assertStatus(422);
    }

    /** ADR-0027 hardening — a transfer receipt whose recipient isn't one of
     *  the tenant's configured receiving accounts flags recipient_mismatch,
     *  and that flag blocks a plain confirm on the turn-in. */
    public function test_transfer_receipt_recipient_is_checked_against_company_accounts(): void
    {
        CompanyAccount::create([
            'tenant_id' => $this->tenant, 'channel' => 'wallet',
            'label' => 'GCash — ServIQ Acme', 'account_no' => '09171234567',
        ]);
        $invoice = $this->invoice($this->agent, 100000);
        $this->paidCash($invoice);

        // Recipient matches a configured account → clean receipt.
        $good = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'x', 'confidence' => 0.95,
            'extracted' => ['reference' => 'GC-OK', 'amount_cents' => 100000,
                            'recipient_name' => 'ServIQ Acme', 'recipient_account' => '0917-123-4567'],
        ])->assertCreated();
        $this->assertNotContains('recipient_mismatch', $good->json('data.flags') ?? []);

        // Recipient points elsewhere → flag on the evidence…
        $bad = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'y', 'confidence' => 0.95,
            'extracted' => ['reference' => 'GC-BAD', 'amount_cents' => 100000,
                            'recipient_name' => 'Some Friend', 'recipient_account' => '09998887777'],
        ])->assertCreated();
        $this->assertContains('recipient_mismatch', $bad->json('data.flags'));

        // …and the flag travels to the turn-in, blocking a plain confirm.
        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'channel' => 'wallet', 'evidence_id' => $bad->json('data.id'),
        ])->assertCreated();
        $this->assertContains('recipient_mismatch', $turn->json('data.flags'));
        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertStatus(422);
        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm", ['decision' => 'reject'])
            ->assertOk()->assertJsonPath('data.status', 'rejected');
    }

    public function test_recipient_check_is_silent_without_configured_accounts(): void
    {
        // No accounts configured → the parse stands; verification is manual.
        $r = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'x', 'confidence' => 0.95,
            'extracted' => ['reference' => 'GC-NOCFG', 'amount_cents' => 5000,
                            'recipient_name' => 'Anyone', 'recipient_account' => '000'],
        ])->assertCreated();
        $this->assertNotContains('recipient_mismatch', $r->json('data.flags') ?? []);
    }

    public function test_claimed_recipient_differs_from_parse_flags_mismatch(): void
    {
        $r = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'x', 'confidence' => 0.95,
            'extracted' => ['reference' => 'GC-C1', 'amount_cents' => 5000, 'recipient_name' => 'ServIQ Acme'],
            'claimed' => ['recipient' => 'ServIQ Acme Corp'],
        ])->assertCreated();
        $this->assertContains('claimed_mismatch', $r->json('data.flags'));
        $this->assertSame('ServIQ Acme Corp', $r->json('data.claimed_recipient'));
    }

    /** The claimed recipient gets the same account check as the parsed one —
     *  otherwise an unparseable receipt with a manually typed wrong account
     *  would carry no recipient_mismatch flag at all. */
    public function test_claimed_recipient_to_unknown_account_flags_too(): void
    {
        CompanyAccount::create([
            'tenant_id' => $this->tenant, 'channel' => 'wallet',
            'label' => 'GCash — ServIQ Acme', 'account_no' => '09171234567',
        ]);
        $r = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'x', 'confidence' => 0.95,
            'extracted' => ['reference' => 'GC-C2', 'amount_cents' => 5000],
            'claimed' => ['recipient' => '09998887777'],
        ])->assertCreated();
        $this->assertContains('recipient_mismatch', $r->json('data.flags'));
        // A claimed recipient that IS a configured account stays clean.
        $ok = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'file_ref' => 'y', 'confidence' => 0.95,
            'extracted' => ['reference' => 'GC-C3', 'amount_cents' => 5000],
            'claimed' => ['recipient' => '0917-123-4567'],
        ])->assertCreated();
        $this->assertNotContains('recipient_mismatch', $ok->json('data.flags') ?? []);
    }

    /** Dispatcher decisions are part of the domain record — a rejected
     *  turn-in emits Remittance.Rejected (who, why, flags), and Confirmed
     *  carries the decision itself so override reads differently from a
     *  clean confirm downstream. */
    public function test_dispatcher_decisions_are_evented(): void
    {
        $invoice = $this->invoice($this->agent, 100000);
        $this->paidCash($invoice);

        $turn = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'counted_total_cents' => 100000,
        ])->assertCreated();

        $this->api('POST', "/remittances/{$turn->json('data.id')}/confirm",
            ['decision' => 'reject', 'notes' => 'suspect photo'])
            ->assertOk()->assertJsonPath('data.status', 'rejected');

        $this->assertDatabaseHas('outbox', ['type' => 'Remittance.Rejected']);

        // Rejection released the collection — turn in again and confirm.
        $turn2 = $this->api('POST', '/remittances/turn-ins', [
            'agent_id' => $this->agent, 'counted_total_cents' => 100000,
        ])->assertCreated();
        $this->api('POST', "/remittances/{$turn2->json('data.id')}/confirm", ['decision' => 'confirm'])
            ->assertOk()->assertJsonPath('data.status', 'remitted');

        $this->assertDatabaseHas('outbox', [
            'type' => 'Remittance.Confirmed',
            'payload->decision' => 'confirm',
        ]);
    }

    public function test_evidence_upload_persists_the_artifact(): void
    {
        Storage::fake('s3');
        $png = base64_encode('fake-image-bytes');

        $r = $this->api('POST', '/payment-evidence', [
            'document_type' => 'E_WALLET', 'filename' => 'gcash.jpg', 'file_b64' => $png,
            'confidence' => 0.95,
            'extracted' => ['reference' => 'GC-FILE-1', 'amount_cents' => 5000],
        ])->assertCreated();

        $ref = $r->json('data.file_ref');
        $this->assertStringStartsWith(config('filesystems.disks.s3.bucket').'/', $ref);
        Storage::disk('s3')->assertExists(substr($ref, strlen(config('filesystems.disks.s3.bucket')) + 1));

        $this->api('GET', "/payment-evidence/{$r->json('data.id')}/file")
            ->assertOk()->assertHeader('content-type', 'image/jpeg');
    }

    public function test_agent_held_wallet_payment_is_not_digital_remittable(): void
    {
        $agentHeld = $this->invoice($this->agent, 90000);
        $this->paidWalletToAgent($agentHeld);
        $companyHeld = $this->invoice($this->agent, 40000);
        $this->api('POST', "/invoices/{$companyHeld->id}/pay",
            ['method' => 'wallet', 'holder' => 'company', 'reference' => 'W-CO'])->assertCreated();

        // Agent-held funds are owed through a turn-in, not bulk digital.
        $this->api('POST', '/remittances/digital', ['invoice_ids' => [$agentHeld->id]])->assertStatus(422);
        $this->api('POST', '/remittances/digital', ['invoice_ids' => [$companyHeld->id]])
            ->assertCreated()->assertJsonPath('data.status', 'remitted');
    }

    public function test_expired_token_is_rejected(): void
    {
        $expired = JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Dispatcher'], 'jti' => (string) Str::uuid(),
            'iat' => time() - 7200, 'exp' => time() - 3600,
        ], config('platform.jwt.secret'), 'HS256');

        $this->withToken($expired)->json('GET', "/api/v1/tenants/{$this->tenant}/invoices")
            ->assertStatus(401);
    }
}
