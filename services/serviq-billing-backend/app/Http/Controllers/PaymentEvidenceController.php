<?php

namespace App\Http\Controllers;

use App\Domain\Billing\InvoiceStore;
use App\Models\CompanyAccount;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentEvidence;
use App\Models\Remittance;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
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
        $page = PaymentEvidence::where('tenant_id', $tenant)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('document_type'), fn ($q, $t) => $q->where('document_type', $t))
            ->latest()->paginate(50);

        $this->annotateDuplicates($tenant, collect($page->items()));

        return response()->json($page);
    }

    public function store(string $tenant, Request $request): JsonResponse
    {
        $data = $request->validate([
            'document_type' => ['required', Rule::in(PaymentEvidence::TYPES)],
            'file' => ['nullable', 'file', 'max:10240'],
            'file_b64' => ['nullable', 'string'],
            'filename' => ['nullable', 'string', 'max:255'],
            'file_ref' => ['required_without_all:file,file_b64', 'nullable', 'string', 'max:512'],
            'raw_text' => ['nullable', 'string'],
            'confidence' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'invoice_id' => ['nullable', 'uuid'],
            'extracted' => ['required', 'array'],
            'extracted.reference' => [
                Rule::requiredIf(fn () => in_array($request->input('document_type'), ['E_WALLET', 'BANK_SLIP', 'REMITTANCE_RECEIPT', 'BANK_CHECK', 'POS_RECEIPT'], true)),
                'nullable', 'string', 'max:255',
            ],
            'extracted.amount_cents' => ['required', 'integer', 'min:0'],
            'extracted.channel' => ['nullable', 'string', 'max:100'],
            'extracted.payer_name' => ['nullable', 'string', 'max:255'],
            'extracted.recipient_name' => ['nullable', 'string', 'max:255'],
            'extracted.recipient_account' => ['nullable', 'string', 'max:255'],
            'extracted.paid_at' => ['nullable', 'date'],
            'claimed' => ['nullable', 'array'],
            'claimed.reference' => ['nullable', 'string', 'max:255'],
            'claimed.amount_cents' => ['nullable', 'integer', 'min:0'],
            'claimed.holder' => ['nullable', Rule::in(['agent', 'company'])],
            'claimed.recipient' => ['nullable', 'string', 'max:255'],
        ]);

        $actorId = $request->attributes->get('jwt')['sub'] ?? null;
        $invoice = isset($data['invoice_id'])
            ? Invoice::where('tenant_id', $tenant)->find($data['invoice_id'])
            : null;
        abort_if(isset($data['invoice_id']) && $invoice === null, 404, 'Invoice not found');

        $flags = $this->guardrails($tenant, $data, $invoice);
        $fileRef = $this->storeFile($tenant, $request, $data) ?? $data['file_ref'];

        $evidence = DB::transaction(function () use ($tenant, $data, $invoice, $flags, $actorId, $fileRef) {
            $evidence = PaymentEvidence::create([
                'tenant_id' => $tenant, 'uploader_id' => $actorId,
                'document_type' => $data['document_type'], 'file_ref' => $fileRef,
                'raw_text' => $data['raw_text'] ?? null, 'extracted' => $data['extracted'],
                'claimed_reference' => $data['claimed']['reference'] ?? null,
                'claimed_amount_cents' => $data['claimed']['amount_cents'] ?? null,
                'claimed_holder' => $data['claimed']['holder'] ?? null,
                'claimed_recipient' => $data['claimed']['recipient'] ?? null,
                'confidence' => $data['confidence'] ?? null,
                'status' => $flags ? PaymentEvidence::FLAGGED : PaymentEvidence::ACCEPTED,
                'flags' => $flags ?: null,
                'invoice_id' => $invoice?->id,
            ]);
            $this->recordPaymentFromEvidence($evidence, $invoice);
            $this->events->record('PaymentEvidence.Received', [
                'evidence_id' => $evidence->id, 'document_type' => $evidence->document_type,
                'status' => $evidence->status, 'flags' => $flags, 'invoice_id' => $invoice?->id,
                'uploader_id' => $actorId,
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

    /**
     * Fraud guard on reads: `duplicate_reference` is true when the parsed
     * reference appears on another (non-rejected) evidence record for the
     * tenant — same signal the intake guardrail flags.
     */
    private function annotateDuplicates(string $tenant, $items): void
    {
        $refs = $items->map(fn ($e) => $e->extracted['reference'] ?? null)->filter()->unique()->values();
        $counts = $refs->isEmpty() ? collect() : PaymentEvidence::where('tenant_id', $tenant)
            ->where('status', '!=', PaymentEvidence::REJECTED)
            ->whereIn('extracted->reference', $refs)
            ->groupByRaw("extracted->>'reference'")
            ->selectRaw("extracted->>'reference' AS ref, COUNT(*) AS dupes")
            ->pluck('dupes', 'ref');

        foreach ($items as $e) {
            $ref = $e->extracted['reference'] ?? null;
            $seen = $ref === null ? 0 : (int) ($counts[$ref] ?? 0);
            $others = $e->status === PaymentEvidence::REJECTED ? $seen : $seen - 1;
            $e->setAttribute('duplicate_reference', $ref !== null && $others >= 1);
        }
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

        // Recipient check — a transfer receipt that names an account other
        // than one of the tenant's configured receiving accounts is suspect:
        // the money may be real but going somewhere else entirely. The
        // claimed recipient gets the same check — otherwise an unparseable
        // receipt plus a typed wrong account would sail through unflagged.
        if ($this->recipientMismatched($tenant, $data['document_type'] ?? '',
            $data['extracted']['recipient_name'] ?? null, $data['extracted']['recipient_account'] ?? null)
            || (isset($data['claimed']['recipient'])
                && $this->recipientMismatched($tenant, $data['document_type'] ?? '',
                    $data['claimed']['recipient'], null))) {
            $flags[] = 'recipient_mismatch';
        }

        // Claimed vs parsed — the uploader's word against the document.
        $claimed = $data['claimed'] ?? null;
        if ($claimed && (
            (isset($claimed['amount_cents']) && $claimed['amount_cents'] !== ($data['extracted']['amount_cents'] ?? null))
            || (isset($claimed['reference']) && strcasecmp($claimed['reference'], $data['extracted']['reference'] ?? '') !== 0)
            || (isset($claimed['recipient']) && ! collect([$data['extracted']['recipient_name'] ?? null, $data['extracted']['recipient_account'] ?? null])
                ->filter()->contains(fn ($v) => strcasecmp($claimed['recipient'], $v) === 0))
        )) {
            $flags[] = 'claimed_mismatch';
        }

        return $flags;
    }

    /** Receipt doc types that carry a recipient — each proves a specific rail. */
    private const RECIPIENT_RAILS = [
        'E_WALLET' => 'wallet', 'BANK_SLIP' => 'bank', 'REMITTANCE_RECEIPT' => 'remittance_center',
    ];

    /**
     * True when the tenant has receiving accounts configured for the evidence's
     * rail, the parse produced a recipient, and nothing matches. Absent config
     * or absent recipient → no flag (dispatcher verifies against the preview).
     */
    private function recipientMismatched(string $tenant, string $documentType, ?string $recipientName, ?string $recipientAccount): bool
    {
        $channel = self::RECIPIENT_RAILS[$documentType] ?? null;
        if ($channel === null) {
            return false;
        }
        $accounts = CompanyAccount::where('tenant_id', $tenant)->where('channel', $channel)->get();
        if ($accounts->isEmpty()) {
            return false;
        }
        $name = self::norm($recipientName);
        $acct = self::norm($recipientAccount);
        if ($name === null && $acct === null) {
            return false;
        }
        return ! $accounts->contains(function ($a) use ($name, $acct) {
            $aAcct = self::norm($a->account_no);
            $aName = self::norm($a->label);
            // Account numbers match exactly; printed names vary enough that a
            // containment check (either direction) counts as a match.
            return ($aAcct !== null && ($aAcct === $acct || $aAcct === $name))
                || ($aName !== null && $name !== null
                    && ($aName === $name || str_contains($aName, $name) || str_contains($name, $aName)));
        });
    }

    private static function norm(?string $v): ?string
    {
        $n = preg_replace('/[^a-z0-9]/i', '', (string) $v);

        return $n === '' ? null : strtolower($n);
    }

    /** Stream the stored artifact — reviewers verify the parse against the image. */
    public function file(string $tenant, PaymentEvidence $evidence)
    {
        abort_unless($evidence->tenant_id === $tenant, 404);
        $bucket = config('filesystems.disks.s3.bucket');
        $ref = (string) $evidence->file_ref;
        abort_unless(str_starts_with($ref, $bucket.'/'), 404); // legacy label refs have no object

        return Storage::disk('s3')->response(substr($ref, strlen($bucket) + 1));
    }

    /** Persist the uploaded artifact to the evidence bucket; returns the
     *  object ref ("bucket/key") that becomes file_ref. */
    private static bool $bucketReady = false;

    private function storeFile(string $tenant, Request $request, array $data): ?string
    {
        $bytes = null;
        $name = $data['filename'] ?? null;
        if ($request->hasFile('file')) {
            $bytes = $request->file('file')->get();
            $name = $request->file('file')->getClientOriginalName();
        } elseif (! empty($data['file_b64'])) {
            $bytes = base64_decode($data['file_b64'], true);
            abort_if($bytes === false, 422, 'file_b64 is not valid base64');
        }
        if ($bytes === null) {
            return null;
        }

        $disk = Storage::disk('s3');
        $bucket = config('filesystems.disks.s3.bucket');
        if (! self::$bucketReady) {
            // Lazy bucket ensure — tolerant: faked disks (tests) have no
            // getClient(), and a failed ensure surfaces at `put` anyway.
            try {
                $disk->getClient()->headBucket(['Bucket' => $bucket]);
            } catch (\Throwable) {
                try {
                    $disk->getClient()->createBucket(['Bucket' => $bucket]);
                } catch (\Throwable) {
                }
            }
            self::$bucketReady = true;
        }

        $safe = $name ? preg_replace('/[^A-Za-z0-9._-]/', '_', $name) : null;
        $key = "{$tenant}/payment-evidence/".Str::uuid7().($safe ? '-'.$safe : '');
        abort_unless($disk->put($key, $bytes), 502, 'Evidence file storage failed');

        return $bucket.'/'.$key;
    }

    /** Accepted evidence on an open invoice records the payment — remitted still takes a dispatcher. */
    private function recordPaymentFromEvidence(PaymentEvidence $evidence, ?Invoice $invoice): void
    {
        if ($evidence->status !== PaymentEvidence::ACCEPTED || $invoice === null || $invoice->status !== Invoice::ISSUED) {
            return;
        }
        $this->store->recordPayment($invoice, [
            'method' => PaymentEvidence::METHOD_MAP[$evidence->document_type] ?? 'cash',
            'holder' => $evidence->claimed_holder,
            'amount_cents' => $evidence->extracted['amount_cents'] ?? null,
            'reference' => $evidence->extracted['reference'] ?? null,
            'evidence_id' => $evidence->id,
            'recorded_by' => $evidence->uploader_id,
        ]);
    }
}
