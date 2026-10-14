<?php

namespace App\Http\Controllers;

use App\Domain\Billing\RemittanceService;
use App\Models\Remittance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Remittance endpoints (CASH_REMITTANCE.MD). Cash turn-ins and deposit-slip
 * batches are created pending and only reach `remitted` through an explicit
 * dispatcher decision — the AI count/parse is advisory. Anomalies land in
 * `manual_review`.
 */
class RemittanceController
{
    public function __construct(private RemittanceService $remittances) {}

    public function index(string $tenant, Request $request): JsonResponse
    {
        return response()->json(
            Remittance::where('tenant_id', $tenant)
                ->when($request->query('kind'), fn ($q, $k) => $q->where('kind', $k))
                ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
                ->when($request->query('agent_id'), fn ($q, $a) => $q->where('agent_id', $a))
                ->latest()->paginate(50)
        );
    }

    public function show(string $tenant, Remittance $remittance): JsonResponse
    {
        abort_unless($remittance->tenant_id === $tenant, 404);

        return response()->json(['data' => [
            'remittance' => $remittance,
            'items' => DB::table('remittance_items')->where('remittance_id', $remittance->id)->get(),
        ]]);
    }

    /** The dispatcher's expected cash list for an agent's turn-in. */
    public function expected(string $tenant, Request $request): JsonResponse
    {
        $data = $request->validate(['agent_id' => ['required', 'uuid']]);

        return response()->json(['data' => $this->remittances->expectedForAgent($tenant, $data['agent_id'])]);
    }

    /** End-of-shift turn-in: cash hand-over needs a counted total; a wallet
     *  turn-in needs the transfer receipt — its parsed amount is the count. */
    public function turnIn(string $tenant, Request $request): JsonResponse
    {
        $data = $request->validate([
            'agent_id' => ['required', 'uuid'],
            'channel' => ['nullable', Rule::in(['cash', 'wallet', 'bank', 'remittance_center'])],
            'counted_total_cents' => ['required_if:channel,cash', 'nullable', 'integer', 'min:0'],
            'breakdown' => ['nullable', 'array'],
            'evidence_id' => ['required_if:channel,wallet,bank,remittance_center', 'nullable', 'uuid'],
        ]);

        $remittance = $this->remittances->submitTurnIn($tenant, $data, $this->actor($request));

        return response()->json(['data' => $remittance], 201);
    }

    /** Bank deposit slip covering a set of cash collections — batch remit. */
    public function batch(string $tenant, Request $request): JsonResponse
    {
        $data = $request->validate([
            'evidence_id' => ['required', 'uuid'],
            'invoice_ids' => ['required', 'array', 'min:1'],
            'invoice_ids.*' => ['uuid'],
        ]);

        $remittance = $this->remittances->submitBatch($tenant, $data, $this->actor($request));

        return response()->json(['data' => $remittance], 201);
    }

    /** Bulk-mark validated digital payments as remitted. */
    public function digital(string $tenant, Request $request): JsonResponse
    {
        $data = $request->validate([
            'invoice_ids' => ['required', 'array', 'min:1'],
            'invoice_ids.*' => ['uuid'],
        ]);

        $remittance = $this->remittances->markDigital($tenant, $data['invoice_ids'], $this->actor($request));

        return response()->json(['data' => $remittance], 201);
    }

    /** Dispatcher decision — the only path to `remitted`. */
    public function confirm(string $tenant, Remittance $remittance, Request $request): JsonResponse
    {
        abort_unless($remittance->tenant_id === $tenant, 404);
        $data = $request->validate([
            'decision' => ['required', Rule::in(['confirm', 'override', 'accept_shortfall', 'reject'])],
            'notes' => ['nullable', 'string'],
        ]);

        $remittance = $this->remittances->confirm($remittance, $data['decision'], $this->actor($request), $data['notes'] ?? null);

        return response()->json(['data' => $remittance]);
    }

    private function actor(Request $request): string
    {
        return $request->attributes->get('jwt')['sub'] ?? 'unknown';
    }
}
