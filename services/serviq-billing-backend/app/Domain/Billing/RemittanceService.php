<?php

namespace App\Domain\Billing;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentEvidence;
use App\Models\Remittance;
use App\Services\DomainEventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Remittance workflows (CASH_REMITTANCE.MD / BILLING.MD).
 *
 * Three kinds: turn_in (agent→dispatcher cash count), deposit_batch
 * (dispatcher→bank slip remits covered collections), digital (validated
 * e-payments bulk-marked). Nothing reaches REMITTED without a human
 * dispatcher's confirm — AI counts and parses are advisory only.
 */
class RemittanceService
{
    public function __construct(
        private InvoiceStore $store,
        private DomainEventRecorder $events,
    ) {}

    /** Pending cash collections for an agent — the dispatcher's expected list. */
    public function expectedForAgent(string $tenant, string $agentId): array
    {
        $invoices = $this->cashCollections($tenant, $agentId)->get();

        return ['agent_id' => $agentId, 'expected_cents' => $invoices->sum('amount_cents'), 'collections' => $invoices];
    }

    /** Agent hands cash to dispatcher: submit the counted total for comparison. */
    public function submitTurnIn(string $tenant, array $data, string $actorId): Remittance
    {
        $invoices = $this->cashCollections($tenant, $data['agent_id'])->lockForUpdate()->get();
        abort_if($invoices->isEmpty(), 422, 'No pending cash collections for this agent');

        $expected = $invoices->sum('amount_cents');

        return DB::transaction(function () use ($tenant, $data, $invoices, $expected, $actorId) {
            $remittance = Remittance::create([
                'tenant_id' => $tenant, 'kind' => Remittance::TURN_IN, 'agent_id' => $data['agent_id'],
                'status' => Remittance::PENDING,
                'total_cents' => $expected, 'expected_cents' => $expected,
                'counted_cents' => $data['counted_total_cents'],
                'variance_cents' => $data['counted_total_cents'] - $expected,
                'evidence_id' => $data['evidence_id'] ?? null,
            ]);
            $this->attach($remittance, $invoices);
            $this->events->record('Remittance.TurnInSubmitted', [
                'remittance_id' => $remittance->id, 'agent_id' => $data['agent_id'],
                'expected_cents' => $expected, 'counted_cents' => $data['counted_total_cents'],
                'variance_cents' => $remittance->variance_cents, 'submitted_by' => $actorId,
            ], $tenant);

            return $remittance;
        });
    }

    /** Deposit-slip batch: one BANK_SLIP evidence remits the covered collections. */
    public function submitBatch(string $tenant, array $data, string $actorId): Remittance
    {
        $evidence = PaymentEvidence::where('tenant_id', $tenant)->findOrFail($data['evidence_id']);
        abort_if($evidence->document_type !== 'BANK_SLIP', 422, 'Evidence is not a bank deposit slip');
        abort_if($evidence->status === PaymentEvidence::REJECTED, 422, 'Evidence was rejected');

        $reference = $evidence->extracted['reference'] ?? null;
        $deposited = (int) ($evidence->extracted['amount_cents'] ?? 0);

        $ids = array_unique($data['invoice_ids']);
        $invoices = Invoice::where('tenant_id', $tenant)->whereIn('id', $ids)->lockForUpdate()->get();
        abort_if($invoices->count() !== count($ids), 422, 'Unknown invoices in batch');
        abort_if($invoices->contains('status', '!=', Invoice::PAID), 409, 'Batch contains invoices that are not paid');
        $nonCash = $invoices->filter(fn ($i) => ! Payment::where('invoice_id', $i->id)->where('method', 'cash')->exists());
        abort_if($nonCash->isNotEmpty(), 422, 'Batch contains invoices without a cash payment: '.$nonCash->pluck('id')->implode(','));

        $flags = [];
        if ($this->referenceSeen($tenant, $reference, $evidence->id)) {
            $flags[] = 'duplicate_reference';
        }
        if ($deposited < $invoices->sum('amount_cents')) {
            $flags[] = 'under_remitted';
        }

        return DB::transaction(function () use ($tenant, $evidence, $reference, $deposited, $invoices, $flags, $actorId) {
            $remittance = Remittance::create([
                'tenant_id' => $tenant, 'kind' => Remittance::DEPOSIT_BATCH,
                'reference' => $reference, 'evidence_id' => $evidence->id,
                'status' => $flags ? Remittance::MANUAL_REVIEW : Remittance::PENDING,
                'flags' => $flags ?: null,
                'total_cents' => $invoices->sum('amount_cents'),
                'expected_cents' => $invoices->sum('amount_cents'),
                'counted_cents' => $deposited,
                'variance_cents' => $deposited - $invoices->sum('amount_cents'),
            ]);
            $this->attach($remittance, $invoices);
            $this->events->record('Remittance.BatchSubmitted', [
                'remittance_id' => $remittance->id, 'reference' => $reference,
                'deposited_cents' => $deposited, 'expected_cents' => $remittance->expected_cents,
                'flags' => $flags, 'submitted_by' => $actorId,
            ], $tenant);

            return $remittance;
        });
    }

    /** Validated digital payments bulk-marked remitted by the dispatcher. */
    public function markDigital(string $tenant, array $invoiceIds, string $actorId): Remittance
    {
        $invoices = Invoice::where('tenant_id', $tenant)->whereIn('id', $invoiceIds)->lockForUpdate()->get();
        abort_if($invoices->isEmpty() || $invoices->count() !== count(array_unique($invoiceIds)), 422, 'Unknown invoices in set');
        abort_if($invoices->contains('status', '!=', Invoice::PAID), 409, 'Set contains invoices that are not paid');

        $nonDigital = $invoices->filter(fn ($i) => ! Payment::where('invoice_id', $i->id)->where('method', '!=', 'cash')->exists());
        abort_if($nonDigital->isNotEmpty(), 422, 'Set contains invoices without a digital payment: '.$nonDigital->pluck('id')->implode(','));

        return DB::transaction(function () use ($tenant, $invoices, $actorId) {
            $remittance = Remittance::create([
                'tenant_id' => $tenant, 'kind' => Remittance::DIGITAL,
                'status' => Remittance::REMITTED, 'decision' => 'confirm',
                'total_cents' => $invoices->sum('amount_cents'),
                'expected_cents' => $invoices->sum('amount_cents'),
                'confirmed_by' => $actorId,
            ]);
            $this->attach($remittance, $invoices);
            $this->remitItems($remittance);
            $this->events->record('Remittance.Confirmed', [
                'remittance_id' => $remittance->id, 'kind' => $remittance->kind,
                'total_cents' => $remittance->total_cents, 'confirmed_by' => $actorId,
            ], $tenant);

            return $remittance;
        });
    }

    /**
     * Dispatcher decision on a pending/flagged remittance.
     *   confirm          — matched count or clean batch
     *   override         — dispatcher asserts the flag/variance is wrong (recount)
     *   accept_shortfall — real shortage → remit anyway, Payouts deducts
     *   reject           — nothing remits; invoices stay paid
     */
    public function confirm(Remittance $remittance, string $decision, string $actorId, ?string $notes = null): Remittance
    {
        abort_unless(in_array($remittance->status, [Remittance::PENDING, Remittance::MANUAL_REVIEW], true), 409,
            "Remittance is {$remittance->status}");
        abort_unless(in_array($decision, ['confirm', 'override', 'accept_shortfall', 'reject'], true), 422, 'Unknown decision');
        abort_if($decision === 'confirm' && $remittance->status === Remittance::MANUAL_REVIEW, 422,
            'Flagged remittances need an explicit override or reject');
        abort_if($decision === 'confirm' && $remittance->variance_cents !== 0 && $remittance->kind === Remittance::TURN_IN, 422,
            'Variance requires override or accept_shortfall');
        abort_if($decision === 'accept_shortfall' && $remittance->variance_cents >= 0, 422,
            'accept_shortfall applies only to a shortage');

        return DB::transaction(function () use ($remittance, $decision, $actorId, $notes) {
            $remittance->decision = $decision;
            $remittance->decision_notes = $notes;

            if ($decision === 'reject') {
                $remittance->status = Remittance::REJECTED;
                $remittance->confirmed_by = $actorId;
                $remittance->save();

                return $remittance;
            }

            $remittance->confirmed_by = $actorId;
            if ($decision === 'override' || $remittance->status === Remittance::MANUAL_REVIEW) {
                $remittance->overridden_by = $actorId;
            }
            $remittance->status = Remittance::REMITTED;
            $remittance->save();

            $this->remitItems($remittance);
            $this->events->record('Remittance.Confirmed', [
                'remittance_id' => $remittance->id, 'kind' => $remittance->kind,
                'total_cents' => $remittance->total_cents,
                'confirmed_by' => $actorId, 'overridden_by' => $remittance->overridden_by,
            ], $remittance->tenant_id);

            if ($decision === 'accept_shortfall') {
                $this->events->record('Remittance.ShortfallAccepted', [
                    'remittance_id' => $remittance->id, 'agent_id' => $remittance->agent_id,
                    'shortage_cents' => -$remittance->variance_cents, 'accepted_by' => $actorId,
                ], $remittance->tenant_id);
            }

            return $remittance;
        });
    }

    /** Cash-paid invoices still awaiting remittance, optionally one agent's. */
    private function cashCollections(string $tenant, ?string $agentId)
    {
        return Invoice::where('tenant_id', $tenant)->where('status', Invoice::PAID)
            ->when($agentId, fn ($q) => $q->where('agent_id', $agentId))
            ->whereExists(fn ($q) => $q->select(DB::raw(1))->from('payments')
                ->whereColumn('payments.invoice_id', 'invoices.id')->where('method', 'cash'));
    }

    /** Slip/reference reuse across payments, other evidence, and other batches. */
    private function referenceSeen(string $tenant, ?string $reference, string $exceptEvidenceId): bool
    {
        if (! $reference) {
            return false;
        }

        $inEvidence = PaymentEvidence::where('tenant_id', $tenant)->where('id', '!=', $exceptEvidenceId)
            ->where('status', '!=', PaymentEvidence::REJECTED)
            ->where('extracted->reference', $reference)->exists();
        $inPayments = Payment::where('tenant_id', $tenant)->where('reference', $reference)->exists();
        $inBatches = Remittance::where('tenant_id', $tenant)->where('reference', $reference)
            ->where('status', '!=', Remittance::REJECTED)->exists();

        return $inEvidence || $inPayments || $inBatches;
    }

    private function attach(Remittance $remittance, $invoices): void
    {
        foreach ($invoices as $invoice) {
            DB::table('remittance_items')->insert([
                'id' => (string) Str::uuid7(),
                'remittance_id' => $remittance->id, 'invoice_id' => $invoice->id,
                'amount_cents' => $invoice->amount_cents,
            ]);
        }
    }

    private function remitItems(Remittance $remittance): void
    {
        $invoices = Invoice::whereIn('id', DB::table('remittance_items')
            ->where('remittance_id', $remittance->id)->pluck('invoice_id'))
            ->where('status', Invoice::PAID)->get();
        foreach ($invoices as $invoice) {
            $this->store->record($invoice, 'Invoice.Remitted', ['remittance_id' => $remittance->id]);
        }
    }
}
