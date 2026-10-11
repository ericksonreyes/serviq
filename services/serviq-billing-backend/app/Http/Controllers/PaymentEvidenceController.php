<?php

namespace App\Http\Controllers;

use App\Domain\Billing\InvoiceStore;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentEvidence;
use App\Models\Remittance;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Proof-of-payment intake (BILLING.MD). The AI Agent parses evidence and
 * submits structured output here; Billing stores it with a confidence
 * score, applies the fraud/variance guardrails, and flags anomalies for
 * manual review. Accepted evidence records the payment — never settles it.
 */
class PaymentEvidenceController
{
    private const LOW_CONFIDENCE = 0.70;

    public function __construct(
        private InvoiceStore $store,
        private DomainEventRecorder $events,
    ) {}

    public function index(string $tenant, Request $request): JsonResponse
    {
        return response()->json(
            PaymentEvidence::where('tenant_id', $tenant)
                ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
                ->when($request->query('document_type'), fn ($q, $t) => $q->where('document_type', $t))
                ->latest()->paginate(50)
        );
    }

    public function store(string $tenant, Request $request): JsonResponse
    {
        $data = $request->validate([
            'document_type' => ['required', Rule::in(PaymentEvidence::TYPES)],
            'file_ref' => ['required', 'string', 'max:512'],
            'raw_text' => ['nullable', 'string'],
            'confidence' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'invoice_id' => ['nullable', 'uuid'],
            'extracted' => ['required', 'array'],
            'extracted.reference' => [
                Rule::requiredIf(fn () => in_array($request->input('document_type'), ['E_WALLET', 'BANK_SLIP', 'BANK_CHECK', 'POS_RECEIPT'], true)),
                'nullable', 'string', 'max:255',
            ],
            'extracted.amount_cents' => ['required', 'integer', 'min:0'],
            'extracted.channel' => ['nullable', 'string', 'max:100'],
            'extracted.payer_name' => ['nullable', 'string', 'max:255'],
            'extracted.paid_at' => ['nullable', 'date'],
        ]);

        $actorId = $request->attributes->get('jwt')['sub'] ?? null;
        $invoice = isset($data['invoice_id'])
            ? Invoice::where('tenant_id', $tenant)->find($data['invoice_id'])
            : null;
        abort_if(isset($data['invoice_id']) && $invoice === null, 404, 'Invoice not found');

        $flags = $this->guardrails($tenant, $data, $invoice);

        $evidence = DB::transaction(function () use ($tenant, $data, $invoice, $flags, $actorId) {
            $evidence = PaymentEvidence::create([
                'tenant_id' => $tenant, 'uploader_id' => $actorId,
                'document_type' => $data['document_type'], 'file_ref' => $data['file_ref'],
                'raw_text' => $data['raw_text'] ?? null, 'extracted' => $data['extracted'],
                'confidence' => $data['confidence'] ?? null,
                'status' => $flags ? PaymentEvidence::FLAGGED : PaymentEvidence::ACCEPTED,
                'flags' => $flags ?: null,
                'invoice_id' => $invoice?->id,
            ]);
            $this->recordPaymentFromEvidence($evidence, $invoice);
            $this->events->record('PaymentEvidence.Received', [
                'evidence_id' => $evidence->id, 'document_type' => $evidence->document_type,
                'status' => $evidence->status, 'flags' => $flags, 'invoice_id' => $invoice?->id,
            ], $tenant);

            return $evidence;
        });

        return response()->json(['data' => $evidence], 201);
    }

    /** Dispatcher/CS resolution of a flagged record — accept or reject. */
    public function review(string $tenant, PaymentEvidence $evidence, Request $request): JsonResponse
    {
        abort_unless($evidence->tenant_id === $tenant, 404);
        abort_unless($evidence->status === PaymentEvidence::FLAGGED, 409, "Evidence is {$evidence->status}");

        $data = $request->validate([
            'decision' => ['required', Rule::in(['accept', 'reject'])],
            'notes' => ['nullable', 'string'],
        ]);
        $actorId = $request->attributes->get('jwt')['sub'] ?? null;

        DB::transaction(function () use ($evidence, $data, $actorId, $tenant) {
            $evidence->update([
                'status' => $data['decision'] === 'accept' ? PaymentEvidence::ACCEPTED : PaymentEvidence::REJECTED,
                'reviewed_by' => $actorId, 'reviewed_at' => now(), 'review_notes' => $data['notes'] ?? null,
            ]);
            if ($data['decision'] === 'accept') {
                $this->recordPaymentFromEvidence($evidence, $evidence->invoice_id
                    ? Invoice::where('tenant_id', $tenant)->find($evidence->invoice_id) : null);
            }
            $this->events->record('PaymentEvidence.Reviewed', [
                'evidence_id' => $evidence->id, 'decision' => $data['decision'], 'reviewed_by' => $actorId,
            ], $tenant);
        });

        return response()->json(['data' => $evidence->fresh()]);
    }

    /** Billing guardrails — duplicate reference, under-remittance, low confidence. */
    private function guardrails(string $tenant, array $data, ?Invoice $invoice): array
    {
        $flags = [];
        $reference = $data['extracted']['reference'] ?? null;

        if ($reference) {
            $seenInEvidence = PaymentEvidence::where('tenant_id', $tenant)
                ->where('status', '!=', PaymentEvidence::REJECTED)
                ->where('extracted->reference', $reference)->exists();
            $seenInPayments = Payment::where('tenant_id', $tenant)->where('reference', $reference)->exists();
            $seenInBatches = Remittance::where('tenant_id', $tenant)->where('reference', $reference)
                ->where('status', '!=', Remittance::REJECTED)->exists();
            if ($seenInEvidence || $seenInPayments || $seenInBatches) {
                $flags[] = 'duplicate_reference';
            }
        }

        if ($invoice !== null && ($data['extracted']['amount_cents'] ?? 0) < $invoice->amount_cents) {
            $flags[] = 'under_remitted';
        }

        if (isset($data['confidence']) && (float) $data['confidence'] < self::LOW_CONFIDENCE) {
            $flags[] = 'low_confidence';
        }

        return $flags;
    }

    /** Accepted evidence on an open invoice records the payment — remitted still takes a dispatcher. */
    private function recordPaymentFromEvidence(PaymentEvidence $evidence, ?Invoice $invoice): void
    {
        if ($evidence->status !== PaymentEvidence::ACCEPTED || $invoice === null || $invoice->status !== Invoice::ISSUED) {
            return;
        }
        $this->store->recordPayment($invoice, [
            'method' => PaymentEvidence::METHOD_MAP[$evidence->document_type] ?? 'cash',
            'amount_cents' => $evidence->extracted['amount_cents'] ?? null,
            'reference' => $evidence->extracted['reference'] ?? null,
            'evidence_id' => $evidence->id,
            'recorded_by' => $evidence->uploader_id,
        ]);
    }
}
