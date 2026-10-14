<?php

namespace App\Http\Controllers;

use App\Models\CompanyAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The tenant's receiving accounts — company e-wallet, bank account, and
 * remittance-center claimant identity. Transfer-receipt parsing checks the
 * extracted recipient against this list; a mismatch flags the evidence
 * (recipient_mismatch) before it can fund a turn-in.
 */
class CompanyAccountController
{
    public function index(string $tenant): JsonResponse
    {
        return response()->json(['data' => CompanyAccount::where('tenant_id', $tenant)->get()]);
    }

    public function store(string $tenant, Request $request): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', Rule::in(CompanyAccount::CHANNELS)],
            'label' => ['required', 'string', 'max:255'],
            'account_no' => ['nullable', 'string', 'max:255'],
        ]);

        return response()->json([
            'data' => CompanyAccount::create($data + ['tenant_id' => $tenant]),
        ], 201);
    }

    public function destroy(string $tenant, CompanyAccount $account): JsonResponse
    {
        abort_unless($account->tenant_id === $tenant, 404);
        $account->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }
}
