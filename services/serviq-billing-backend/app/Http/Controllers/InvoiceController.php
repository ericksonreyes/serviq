<?php

namespace App\Http\Controllers;

use App\Domain\Billing\InvoiceStore;
use App\Models\Invoice;
use App\Models\InvoiceEvent;
use App\Models\Payment;
use App\Models\Remittance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InvoiceController
{
    public function __construct(private InvoiceStore $store) {}

    public function index(string $tenant, Request $request): JsonResponse
    {
        return response()->json(
            Invoice::where('tenant_id', $tenant)
                ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
                ->latest()->paginate(50)
        );
    }

    public function show(string $tenant, Invoice $invoice): JsonResponse
    {
        abort_unless($invoice->tenant_id === $tenant, 404);

        return response()->json(['data' => [
            'invoice' => $invoice,
            'payments' => Payment::where('invoice_id', $invoice->id)->get(),
            'history' => InvoiceEvent::where('invoice_id', $invoice->id)->orderBy('seq')->get(),
        ]]);
    }

    /** Record payment evidence (method + external reference). */
    public function pay(Request $request, string $tenant, Invoice $invoice): JsonResponse
    {
        abort_unless($invoice->tenant_id === $tenant, 404);
        abort_if($invoice->status !== Invoice::ISSUED, 409, "Invoice is {$invoice->status}");
        $data = $request->validate([
            'method' => ['required', 'in:cash,card,wallet,bank'],
            'reference' => ['nullable', 'string', 'max:255'],
            'amount_cents' => ['nullable', 'integer', 'min:1'],
        ]);

        $payment = DB::transaction(function () use ($data, $invoice, $tenant) {
            $payment = Payment::create([
                'invoice_id' => $invoice->id, 'tenant_id' => $tenant,
                'amount_cents' => $data['amount_cents'] ?? $invoice->amount_cents,
                'method' => $data['method'], 'reference' => $data['reference'] ?? null,
            ]);
            $this->store->record($invoice, 'Invoice.PaymentRecorded', ['payment_id' => $payment->id, 'method' => $payment->method]);

            return $payment;
        });

        return response()->json(['data' => $payment], 201);
    }

    /** Group paid invoices into a remittance batch → settled (flat, full). */
    public function remit(string $tenant): JsonResponse
    {
        $invoices = Invoice::where('tenant_id', $tenant)->where('status', Invoice::PAID)->lockForUpdate()->get();

        $remittance = DB::transaction(function () use ($tenant, $invoices) {
            $remittance = Remittance::create(['tenant_id' => $tenant, 'status' => 'settled', 'total_cents' => $invoices->sum('amount_cents')]);
            foreach ($invoices as $invoice) {
                DB::table('remittance_items')->insert([
                    'id' => (string) \Illuminate\Support\Str::uuid7(),
                    'remittance_id' => $remittance->id, 'invoice_id' => $invoice->id,
                    'amount_cents' => $invoice->amount_cents,
                ]);
                $this->store->record($invoice, 'Invoice.Remitted', ['remittance_id' => $remittance->id]);
            }

            return $remittance;
        });

        return response()->json(['data' => $remittance], 201);
    }

    public function remittances(string $tenant): JsonResponse
    {
        return response()->json(['data' => Remittance::where('tenant_id', $tenant)->latest()->get()]);
    }
}
