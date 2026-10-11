<?php

namespace App\Events\Handlers;

use App\Domain\Billing\InvoiceStore;
use App\Models\Invoice;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Job.Completed → issue the invoice. Support.RefundDecided → execute it.
 * Invoice pricing is stubbed per spec: flat amount until pricing policy
 * lands; recorded in the event so the stub is visible downstream.
 */
class BillingEventHandler
{
    private const DEFAULT_AMOUNT_CENTS = 150000; // PHP 1,500 flat — spec stub

    public function __construct(private InvoiceStore $store) {}

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
            ], $p['amount_cents'] ?? self::DEFAULT_AMOUNT_CENTS);
            Log::info("Invoice issued for job {$jobId}");

            return;
        }

        // Support decides refunds; Billing executes them.
        if ($envelope['type'] === 'Support.RefundDecided') {
            $invoice = isset($p['invoice_id']) ? Invoice::find($p['invoice_id']) : null;
            if ($invoice === null) {
                throw new RuntimeException('Support.RefundDecided for unknown invoice');
            }
            if ($invoice->status === Invoice::REFUNDED) {
                return;
            }
            if (! in_array($invoice->status, [Invoice::PAID, Invoice::REMITTED])) {
                throw new RuntimeException("Cannot refund invoice in {$invoice->status}");
            }
            $this->store->record($invoice, 'Invoice.Refunded', ['reason' => $p['reason'] ?? null, 'decided_by' => $p['decided_by'] ?? null]);
            Log::info("Invoice {$invoice->id} refunded (decision {$p['decision_id']})");
        }
    }
}
