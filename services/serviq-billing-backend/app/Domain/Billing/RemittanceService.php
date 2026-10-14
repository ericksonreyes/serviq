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

    /** Pending collections for an agent — the dispatcher's expected list.
     *  `expected_cents`/`collections` cover cash-held only (physical turn-in);
     *  `held_expected_cents`/`agent_held` cover all agent-held revenue
     *  (ADR-0026/0027: any external-transfer turn-in settles cash + agent-held
     *  digital). `wallet_expected_cents` is the legacy alias.
     *  `in_flight` surfaces open turn-ins so the console can explain why the
     *  expected total dropped to zero after a submission. */
    public function expectedForAgent(string $tenant, string $agentId): array
    {
        $invoices = $this->cashCollections($tenant, $agentId)->get();
        $agentHeld = $this->agentHeldCollections($tenant, $agentId)->get();
        $inFlight = Remittance::where('tenant_id', $tenant)->where('agent_id', $agentId)
            ->where('kind', Remittance::TURN_IN)
            ->whereIn('status', [Remittance::PENDING, Remittance::MANUAL_REVIEW])
            ->latest()->get(['id', 'channel', 'status', 'expected_cents', 'counted_cents', 'variance_cents', 'created_at']);

        return ['agent_id' => $agentId, 'expected_cents' => $invoices->sum('amount_cents'),
                'held_expected_cents' => $agentHeld->sum('amount_cents'),
                'wallet_expected_cents' => $agentHeld->sum('amount_cents'), // legacy alias
                'collections' => $invoices, 'agent_held' => $agentHeld, 'in_flight' => $inFlight];
    }

    /** Agent settles held collections — cash hand-over or e-wallet transfer (ADR-0026). */
    public function submitTurnIn(string $tenant, array $data, string $actorId): Remittance
    {
        $channel = $data['channel'] ?? Remittance::CHANNEL_CASH;

        if ($channel !== Remittance::CHANNEL_CASH) {
            return $this->submitTransferTurnIn($tenant, $data, $actorId, $channel);
        }

        $invoices = $this->cashCollections($tenant, $data['agent_id'])->lockForUpdate()->get();
        abort_if($invoices->isEmpty(), 422, 'No pending cash collections for this agent');

        $expected = $invoices->sum('amount_cents');

        return DB::transaction(function () use ($tenant, $data, $invoices, $expected, $actorId) {
            $remittance = Remittance::create([
                'tenant_id' => $tenant, 'kind' => Remittance::TURN_IN,
                'channel' => Remittance::CHANNEL_CASH, 'agent_id' => $data['agent_id'],
                'status' => Remittance::PENDING,
                'total_cents' => $expected, 'expected_cents' => $expected,
                'counted_cents' => $data['counted_total_cents'],
                'variance_cents' => $data['counted_total_cents'] - $expected,
                'evidence_id' => $data['evidence_id'] ?? null,
            ]);
            $this->attach($remittance, $invoices);
            $this->events->record('Remittance.TurnInSubmitted', [
                'remittance_id' => $remittance->id, 'agent_id' => $data['agent_id'],
                'channel' => Remittance::CHANNEL_CASH,
                'expected_cents' => $expected, 'counted_cents' => $data['counted_total_cents'],
                'variance_cents' => $remittance->variance_cents,
                'invoice_ids' => $invoices->pluck('id')->values()->all(), 'submitted_by' => $actorId,
            ], $tenant);

            return $remittance;
        });
    }

    /** External-transfer rails (ADR-0026/0027): the agent settles through an
     *  outside rail and presents the receipt — the rail decides which evidence
     *  document proves it and which flag marks "verify arrival". */
    private const TRANSFER_RAILS = [
        Remittance::CHANNEL_WALLET => ['doc' => 'E_WALLET', 'flag' => 'wallet_transfer', 'what' => 'an e-wallet transfer receipt'],
        Remittance::CHANNEL_BANK => ['doc' => 'BANK_SLIP', 'flag' => 'bank_transfer', 'what' => 'a bank deposit slip'],
        Remittance::CHANNEL_REMIT_CENTER => ['doc' => 'REMITTANCE_RECEIPT', 'flag' => 'remittance_transfer', 'what' => 'a remittance-center receipt'],
    ];

    /** Transfer turn-in: one external send settles all agent-held collections.
     *  The receipt is the claim — counted comes from its parsed amount, its
     *  reference is dedupe-checked, and it always lands in manual review so a
     *  dispatcher verifies arrival before anything remits. */
    private function submitTransferTurnIn(string $tenant, array $data, string $actorId, string $channel): Remittance
    {
        $rail = self::TRANSFER_RAILS[$channel];
        $evidence = PaymentEvidence::where('tenant_id', $tenant)->findOrFail($data['evidence_id']);
        abort_unless($evidence->document_type === $rail['doc'], 422,
            "Evidence is not {$rail['what']}");
        abort_if($evidence->status === PaymentEvidence::REJECTED, 422, 'Evidence was rejected');

        $invoices = $this->agentHeldCollections($tenant, $data['agent_id'])->lockForUpdate()->get();
        abort_if($invoices->isEmpty(), 422, 'No pending agent-held collections for this agent');

        $expected = $invoices->sum('amount_cents');
        $sent = (int) ($evidence->extracted['amount_cents'] ?? 0);
        $reference = $evidence->extracted['reference'] ?? null;

        $flags = [$rail['flag']];
        if ($this->referenceSeen($tenant, $reference, $evidence->id)) {
            $flags[] = 'duplicate_reference';
        }
        // Evidence-level suspicions (recipient points elsewhere, the uploader
        // corrected the parse) travel with the turn-in — anomaly flags demand
        // override or reject, never a plain confirm.
        foreach (['recipient_mismatch', 'claimed_mismatch'] as $suspect) {
            if (in_array($suspect, $evidence->flags ?? [], true)) {
                $flags[] = $suspect;
            }
        }
        if ($sent < $expected) {
            $flags[] = 'under_remitted';
        }

        return DB::transaction(function () use ($tenant, $data, $evidence, $invoices, $expected, $sent, $reference, $flags, $actorId, $channel) {
            $remittance = Remittance::create([
                'tenant_id' => $tenant, 'kind' => Remittance::TURN_IN,
                'channel' => $channel, 'agent_id' => $data['agent_id'],
                'reference' => $reference, 'evidence_id' => $evidence->id,
                'status' => Remittance::MANUAL_REVIEW, 'flags' => $flags,
                'total_cents' => $expected, 'expected_cents' => $expected,
                'counted_cents' => $sent, 'variance_cents' => $sent - $expected,
            ]);
            $this->attach($remittance, $invoices);
            $this->events->record('Remittance.TurnInSubmitted', [
                'remittance_id' => $remittance->id, 'agent_id' => $data['agent_id'],
                'channel' => $channel, 'reference' => $reference,
                'expected_cents' => $expected, 'counted_cents' => $sent,
                'variance_cents' => $remittance->variance_cents,
                'invoice_ids' => $invoices->pluck('id')->values()->all(), 'submitted_by' => $actorId,
            ], $tenant);

            return $remittance;
        });
    }

    /** Deposit batch: one deposit slip / remittance receipt remits the covered collections. */
    public function submitBatch(string $tenant, array $data, string $actorId): Remittance
    {
        $evidence = PaymentEvidence::where('tenant_id', $tenant)->findOrFail($data['evidence_id']);
        abort_unless(in_array($evidence->document_type, PaymentEvidence::DEPOSIT_TYPES, true), 422,
            'Evidence is not a bank deposit slip or remittance-center receipt');
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
                'remittance_id' => $remittance->id, 'evidence_id' => $evidence->id, 'reference' => $reference,
                'deposited_cents' => $deposited, 'expected_cents' => $remittance->expected_cents,
                'invoice_ids' => $invoices->pluck('id')->values()->all(),
                'flags' => $flags, 'submitted_by' => $actorId,
            ], $tenant);

            return $remittance;
        });
    }

    /** Validated company-held digital payments bulk-marked remitted. */
    public function markDigital(string $tenant, array $invoiceIds, string $actorId): Remittance
    {
        $invoices = Invoice::where('tenant_id', $tenant)->whereIn('id', $invoiceIds)->lockForUpdate()->get();
        abort_if($invoices->isEmpty() || $invoices->count() !== count(array_unique($invoiceIds)), 422, 'Unknown invoices in set');
        abort_if($invoices->contains('status', '!=', Invoice::PAID), 409, 'Set contains invoices that are not paid');

        $nonDigital = $invoices->filter(fn ($i) => ! Payment::where('invoice_id', $i->id)
            ->where('method', '!=', 'cash')->where('holder', 'company')->exists());
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
                'decision' => 'confirm',
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
        // The rail flag alone (`wallet_transfer`/`bank_transfer`/`remittance_transfer`)
        // marks mandatory arrival verification, not an anomaly — a clean transfer
        // turn-in confirms normally once the dispatcher sees the funds; anomaly
        // flags still demand override/accept/reject.
        $onlyTransferVerify = isset(self::TRANSFER_RAILS[$remittance->channel])
            && collect($remittance->flags ?? [])->diff(array_column(self::TRANSFER_RAILS, 'flag'))->isEmpty();
        abort_if($decision === 'confirm' && $remittance->status === Remittance::MANUAL_REVIEW && ! $onlyTransferVerify, 422,
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
                // Rejection is a headline audit event — a dispatcher declining
                // a suspicious turn-in/batch must land in the event stream,
                // not just the row state.
                $this->events->record('Remittance.Rejected', [
                    'remittance_id' => $remittance->id, 'kind' => $remittance->kind,
                    'channel' => $remittance->channel, 'reference' => $remittance->reference,
                    'agent_id' => $remittance->agent_id, 'flags' => $remittance->flags,
                    'rejected_by' => $actorId, 'notes' => $notes,
                ], $remittance->tenant_id);

                return $remittance;
            }

            $remittance->confirmed_by = $actorId;
            if ($decision === 'override' || $remittance->status === Remittance::MANUAL_REVIEW) {
                $remittance->overridden_by = $actorId;
            }
            $remittance->status = Remittance::REMITTED;
            $remittance->save();

            $this->remitItems($remittance);
            // The decision IS the audit trail — confirm vs override vs
            // accept_shortfall read very differently in review, so the event
            // carries the decision, notes, variance, flags, and the evidence
            // trail rather than leaving them in row columns alone.
            $this->events->record('Remittance.Confirmed', [
                'remittance_id' => $remittance->id, 'kind' => $remittance->kind,
                'channel' => $remittance->channel, 'reference' => $remittance->reference,
                'evidence_id' => $remittance->evidence_id,
                'decision' => $decision, 'decision_notes' => $notes,
                'total_cents' => $remittance->total_cents,
                'expected_cents' => $remittance->expected_cents,
                'variance_cents' => $remittance->variance_cents,
                'flags' => $remittance->flags,
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

    /** Cash-paid invoices still awaiting remittance, optionally one agent's.
     *  Invoices already attached to a live remittance are excluded — a
     *  rejected remittance releases its items back to pending. */
    private function cashCollections(string $tenant, ?string $agentId)
    {
        return $this->unremitted($tenant, $agentId)
            ->whereExists(fn ($q) => $q->select(DB::raw(1))->from('payments')
                ->whereColumn('payments.invoice_id', 'invoices.id')->where('method', 'cash'));
    }

    /** All agent-held collections awaiting remittance — cash plus digital
     *  payments that landed in the agent's own wallet (ADR-0026). */
    private function agentHeldCollections(string $tenant, ?string $agentId)
    {
        return $this->unremitted($tenant, $agentId)
            ->whereExists(fn ($q) => $q->select(DB::raw(1))->from('payments')
                ->whereColumn('payments.invoice_id', 'invoices.id')->where('holder', 'agent'));
    }

    private function unremitted(string $tenant, ?string $agentId)
    {
        return Invoice::where('tenant_id', $tenant)->where('status', Invoice::PAID)
            ->when($agentId, fn ($q) => $q->where('agent_id', $agentId))
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('remittance_items')
                ->join('remittances', 'remittances.id', '=', 'remittance_items.remittance_id')
                ->whereColumn('remittance_items.invoice_id', 'invoices.id')
                ->where('remittances.status', '!=', Remittance::REJECTED));
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
