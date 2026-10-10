<?php

namespace App\Http\Controllers;

use App\Models\RefundDecision;
use App\Models\SupportCase;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CaseController
{
    public function index(string $tenant, Request $request): JsonResponse
    {
        return response()->json(
            SupportCase::where('tenant_id', $tenant)
                ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
                ->latest()->paginate(50)
        );
    }

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'job_id' => ['nullable', 'uuid'],
            'invoice_id' => ['nullable', 'uuid'],
            'customer_id' => ['nullable', 'uuid'],
            'details' => ['nullable', 'array'],
        ]);

        $case = DB::transaction(function () use ($data, $request, $events) {
            $case = SupportCase::create($data + ['tenant_id' => $request->tenant_id, 'status' => 'open']);
            $events->record('Support.CaseOpened', [
                'case_id' => $case->id, 'job_id' => $case->job_id, 'subject' => $case->subject,
            ], $case->tenant_id);

            return $case;
        });

        return response()->json(['data' => $case], 201);
    }

    /** ADR-0004: record the decision; emit Support.RefundDecided — Billing executes. */
    public function decideRefund(Request $request, string $tenant, SupportCase $case, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($case->tenant_id === $tenant, 404);
        abort_if($case->status === 'closed', 409, 'Case is closed');
        $data = $request->validate([
            'decision' => ['required', 'in:approved,denied'],
            'amount_cents' => ['nullable', 'integer', 'min:1'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);
        abort_if($case->invoice_id === null && $data['decision'] === 'approved', 422, 'Case has no invoice');

        $refund = DB::transaction(function () use ($data, $case, $tenant, $request, $events) {
            $refund = RefundDecision::create([
                'case_id' => $case->id, 'invoice_id' => $case->invoice_id,
                'tenant_id' => $tenant, 'amount_cents' => $data['amount_cents'] ?? null,
                'decision' => $data['decision'], 'reason' => $data['reason'] ?? null,
                'decided_by' => $request->user()?->id ?? $request->attributes->get('jwt.sub'),
            ]);
            $case->update(['status' => 'decided']);
            if ($data['decision'] === 'approved') {
                $events->record('Support.RefundDecided', [
                    'decision_id' => $refund->id, 'case_id' => $case->id,
                    'invoice_id' => $case->invoice_id, 'amount_cents' => $refund->amount_cents,
                    'reason' => $refund->reason, 'decided_by' => $refund->decided_by,
                ], $tenant);
            }

            return $refund;
        });

        return response()->json(['data' => $refund], 201);
    }
}
