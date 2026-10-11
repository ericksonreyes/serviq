<?php

namespace App\Domain\Billing;

use App\Models\Invoice;
use App\Models\InvoiceEvent;
use App\Services\DomainEventRecorder;
use Illuminate\Support\Facades\DB;

/** Invoice event sourcing — append events, fold onto the projection. */
class InvoiceStore
{
    private const EVENT_STATUS = [
        'Invoice.Issued' => Invoice::ISSUED,
        'Invoice.PaymentRecorded' => Invoice::PAID,
        'Invoice.Remitted' => Invoice::REMITTED,
        'Invoice.Refunded' => Invoice::REFUNDED,
    ];

    public function __construct(private DomainEventRecorder $events) {}

    public function record(Invoice $invoice, string $type, array $payload): Invoice
    {
        return DB::transaction(function () use ($invoice, $type, $payload) {
            Invoice::where('id', $invoice->id)->lockForUpdate()->first();
            $seq = InvoiceEvent::where('invoice_id', $invoice->id)->max('seq') + 1;
            InvoiceEvent::create(['invoice_id' => $invoice->id, 'seq' => $seq, 'type' => $type, 'payload' => $payload]);
            if (isset(self::EVENT_STATUS[$type])) {
                $invoice->update(['status' => self::EVENT_STATUS[$type], 'version' => $invoice->version + 1]);
            }
            $this->events->record($type, $payload + ['invoice_id' => $invoice->id], $invoice->tenant_id);

            return $invoice->fresh();
        });
    }

    public function issue(array $attrs, int $amountCents): Invoice
    {
        return DB::transaction(function () use ($attrs, $amountCents) {
            $invoice = Invoice::create($attrs + ['status' => Invoice::ISSUED, 'amount_cents' => $amountCents]);
            InvoiceEvent::create(['invoice_id' => $invoice->id, 'seq' => 1, 'type' => 'Invoice.Issued', 'payload' => ['amount_cents' => $amountCents]]);
            $this->events->record('Invoice.Issued', [
                'invoice_id' => $invoice->id, 'job_id' => $invoice->job_id, 'amount_cents' => $amountCents,
            ], $invoice->tenant_id);

            return $invoice;
        });
    }
}
