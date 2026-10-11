<?php

namespace App\Http\Controllers;

use App\Domain\Billing\InvoiceStore;
use App\Models\Invoice;
use App\Models\RefundRequest;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Refund lifecycle per BILLING.MD: anyone tenant-scoped can request,
 * Customer Support's RefundDecided approves (see BillingEventHandler), and
 * a permission-gated executor performs the actual refund payment here.
 */
class RefundRequestController
{
    public function __construct(
        private InvoiceStore $store,
        private DomainEventRecorder $events,
    ) {}

    public function index(Request $request, string $tenant): JsonResponse
    {
        $requests = RefundRequest::where('tenant_id', $tenant)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('invoice_id'), fn ($q, $i) => $q->where('invoice_id', $i))
            ->latest()
            ->paginate(50);

        return response()->json($requests);
    }

    public function store(Request $request, string $tenant): JsonResponse
    {
        $data = $request->validate([
            'invoice_id' => ['required', 'uuid'],
            'reason' => ['nullable', 'string', 'max:2000'],
        ]);

        $invoice = Invoice::where('tenant_id', $tenant)->find($data['invoice_id']);
        abort_if($invoice === null, 404, 'Invoice not found');
        abort_if($invoice->status === Invoice::REFUNDED, 409, 'Invoice already refunded');

        $refund = DB::transaction(function () use ($tenant, $invoice, $data, $request) {
            $refund = RefundRequest::create([
                'tenant_id' => $tenant,
                'invoice_id' => $invoice->id,
                'status' => RefundRequest::PENDING,
                'reason' => $data['reason'] ?? null,
                'requested_by' => $request->attributes->get('jwt')['sub'] ?? null,
            ]);
            $this->events->record('Billing.RefundRequested', [
                'refund_request_id' => $refund->id,
                'invoice_id' => $invoice->id,
                'reason' => $refund->reason,
            ], $tenant);

            return $refund;
        });

        return response()->json(['data' => $refund], 201);
    }

    /**
     * Execute an APPROVED refund — gated on the billing.refunds.execute
     * permission (tenant admins carry finance authority as the fallback
     * until IAM seeds the context permission).
     */
    public function execute(Request $request, string $tenant, RefundRequest $refundRequest): JsonResponse
    {
        abort_unless($refundRequest->tenant_id === $tenant, 404);

        $identity = $request->user();
        $allowed = $identity->isPlatform()
            || $identity->hasPermission('billing.refunds.execute')
            || in_array('Tenant Administrator', $identity->roles(), true);
        if (! $allowed) {
            return response()->json([
                'error' => 'forbidden',
                'message' => 'Missing required permission: billing.refunds.execute',
            ], 403);
        }

        abort_unless($refundRequest->status === RefundRequest::APPROVED, 409, "Refund request is {$refundRequest->status}");

        $invoice = Invoice::where('tenant_id', $tenant)->find($refundRequest->invoice_id);
        abort_if($invoice === null, 404, 'Invoice not found');
        abort_if($invoice->status === Invoice::REFUNDED, 409, 'Invoice already refunded');
        abort_if(! in_array($invoice->status, [Invoice::PAID, Invoice::REMITTED], true), 409, "Cannot refund invoice in {$invoice->status}");

        $actorId = $request->attributes->get('jwt')['sub'] ?? null;
        DB::transaction(function () use ($refundRequest, $invoice, $actorId, $tenant) {
            $this->store->record($invoice, 'Invoice.Refunded', [
                'refund_request_id' => $refundRequest->id,
                'reason' => $refundRequest->reason,
                'executed_by' => $actorId,
            ]);
            $refundRequest->update([
                'status' => RefundRequest::EXECUTED,
                'executed_by' => $actorId,
                'executed_at' => now(),
            ]);
            $this->events->record('Billing.RefundExecuted', [
                'refund_request_id' => $refundRequest->id,
                'invoice_id' => $invoice->id,
                'executed_by' => $actorId,
            ], $tenant);
        });

        return response()->json(['data' => $refundRequest->fresh()]);
    }
}
