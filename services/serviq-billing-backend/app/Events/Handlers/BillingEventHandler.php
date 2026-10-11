<?php

namespace App\Events\Handlers;

use App\Domain\Billing\InvoiceStore;
use App\Models\Invoice;
use App\Models\RefundRequest;
use App\Services\DomainEventRecorder;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Job.Completed → issue the invoice. Support.RefundDecided → approve the
 * matching refund request(s) — the gated execute endpoint performs the
 * actual refund payment. Invoice pricing is stubbed per spec: flat amount
 * until pricing policy lands; recorded in the event so the stub is
 * visible downstream.
 */
class BillingEventHandler
{
    private const DEFAULT_AMOUNT_CENTS = 150000; // PHP 1,500 flat — spec stub

    public function __construct(
        private InvoiceStore $store,
        private DomainEventRecorder $events,
    ) {}

    public function handle(array $envelope): void
    {
        $p = $envelope['payload'] ?? [];

        if ($envelope['type'] === 'Job.Completed') {
            $jobId = $p['job_id'] ?? null;
            if ($jobId === null || Invoice::where('job_id', $jobId)->exists()) {
                return;
            }
            $this->store->issue([
                'job_id' => $jobId,
                'tenant_id' => $envelope['tenant_id'],
                'customer_id' => $p['customer_id'] ?? null,
                'agent_id' => $p['agent_id'] ?? null,
            ], $p['amount_cents'] ?? self::DEFAULT_AMOUNT_CENTS);
            Log::info("Invoice issued for job {$jobId}");

            return;
        }

        // Support decides refunds; Billing executes them. The decision
        // approves pending requests (or creates one when nobody filed one);
        // the permission-gated execute endpoint does the refund payment.
        if ($envelope['type'] === 'Support.RefundDecided') {
            $tenantId = $envelope['tenant_id'] ?? null;
            $invoice = isset($p['invoice_id'])
                ? Invoice::where('tenant_id', $tenantId)->find($p['invoice_id'])
                : null;
            if ($invoice === null) {
                throw new RuntimeException('Support.RefundDecided for unknown invoice');
            }

            $pending = RefundRequest::where('tenant_id', $tenantId)
                ->where('invoice_id', $invoice->id)
                ->where('status', RefundRequest::PENDING)
                ->get();

            if ($pending->isEmpty()) {
                $pending = collect([RefundRequest::create([
                    'tenant_id' => $tenantId,
                    'invoice_id' => $invoice->id,
                    'status' => RefundRequest::PENDING,
                    'reason' => $p['reason'] ?? null,
                    'requested_by' => $p['decided_by'] ?? null,
                ])]);
            }

            foreach ($pending as $request) {
                $request->update([
                    'status' => RefundRequest::APPROVED,
                    'decision_id' => $p['decision_id'] ?? null,
                    'approved_by' => $p['decided_by'] ?? null,
                ]);
                $this->events->record('Billing.RefundRequestApproved', [
                    'refund_request_id' => $request->id,
                    'invoice_id' => $invoice->id,
                    'decision_id' => $p['decision_id'] ?? null,
                    'approved_by' => $p['decided_by'] ?? null,
                ], $tenantId);
            }
            Log::info("Refund decision {$p['decision_id']} approved {$pending->count()} request(s) for invoice {$invoice->id}");
        }
    }
}
