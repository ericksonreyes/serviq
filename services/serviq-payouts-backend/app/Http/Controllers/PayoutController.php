<?php

namespace App\Http\Controllers;

use App\Domain\Payouts\DisbursementPort;
use App\Domain\Payouts\PayoutStore;
use App\Models\Payout;
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
    public function settle(string $tenant, Payout $payout, DisbursementPort $port, PayoutStore $store): JsonResponse
    {
        abort_unless($payout->tenant_id === $tenant, 404);
        abort_if($payout->status !== 'pending', 409, "Payout is {$payout->status}");

        $ref = DB::transaction(function () use ($payout, $port, $store) {
            $ref = $port->disburse($payout);
            $store->record($payout, 'Payout.Settled', [
                'agent_id' => $payout->agent_id, 'net_cents' => $payout->net_cents, 'disbursement_ref' => $ref,
            ]);

            return $ref;
        });

        return response()->json(['data' => $payout->fresh()]);
    }
}
