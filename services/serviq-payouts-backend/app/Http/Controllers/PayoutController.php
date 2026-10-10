<?php

namespace App\Http\Controllers;

use App\Domain\Payouts\DisbursementPort;
use App\Models\Payout;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PayoutController
{
    public function index(string $tenant, Request $request): JsonResponse
    {
        return response()->json(
            Payout::where('tenant_id', $tenant)
                ->when($request->query('agent_id'), fn ($q, $a) => $q->where('agent_id', $a))
                ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
                ->latest()->paginate(50)
        );
    }

    /** Settle a pending payout through the disbursement port. */
    public function settle(string $tenant, Payout $payout, DisbursementPort $port, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($payout->tenant_id === $tenant, 404);
        abort_if($payout->status !== 'pending', 409, "Payout is {$payout->status}");

        DB::transaction(function () use ($payout, $port, $events) {
            $ref = $port->disburse($payout);
            $payout->update(['status' => 'settled', 'disbursement_ref' => $ref]);
            $events->record('Payout.Settled', [
                'payout_id' => $payout->id, 'agent_id' => $payout->agent_id,
                'net_cents' => $payout->net_cents, 'reference' => $ref,
            ], $payout->tenant_id);
        });

        return response()->json(['data' => $payout->fresh()]);
    }
}
