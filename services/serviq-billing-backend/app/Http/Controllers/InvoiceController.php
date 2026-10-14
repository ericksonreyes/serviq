<?php

namespace App\Http\Controllers;

use App\Domain\Billing\InvoiceStore;
use App\Models\Invoice;
use App\Models\InvoiceEvent;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InvoiceController
{
    public function __construct(private InvoiceStore $store) {}

    public function index(string $tenant, Request $request): JsonResponse
    {
        $request->validate(['job_id' => ['nullable', 'uuid'], 'paid_via' => ['nullable', 'in:cash,digital']]);

        return response()->json(
            Invoice::where('tenant_id', $tenant)
                ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
                ->when($request->query('job_id'), fn ($q, $j) => $q->where('job_id', $j))
                ->when($request->query('paid_via'), fn ($q, $via) => $q->whereExists(fn ($p) => $p
                    ->from('payments')->whereColumn('payments.invoice_id', 'invoices.id')
                    ->where('method', $via === 'cash' ? '=' : '!=', 'cash')))
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

    /** Record a direct payment (no AI evidence) — method + external reference. */
    public function pay(Request $request, string $tenant, Invoice $invoice): JsonResponse
    {
        abort_unless($invoice->tenant_id === $tenant, 404);
        $data = $request->validate([
            'method' => ['required', 'in:cash,card,wallet,bank'],
            'holder' => ['nullable', 'in:agent,company'],
            'reference' => ['nullable', 'string', 'max:255'],
            'amount_cents' => ['nullable', 'integer', 'min:1'],
        ]);

        // Fraud guard: a reference may fund one payment only.
        if (($data['reference'] ?? null) && Payment::where('tenant_id', $tenant)->where('reference', $data['reference'])->exists()) {
            abort(409, 'duplicate_reference');
        }

        $payment = $this->store->recordPayment($invoice, [
            'method' => $data['method'],
            'holder' => $data['holder'] ?? null,
            'amount_cents' => $data['amount_cents'] ?? null,
            'reference' => $data['reference'] ?? null,
            'recorded_by' => $request->attributes->get('jwt')['sub'] ?? null,
        ]);

        return response()->json(['data' => $payment], 201);
    }
}
