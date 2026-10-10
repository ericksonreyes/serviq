<?php

namespace App\Http\Controllers;

use App\Models\TenantScope;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Tenant scope provisioning. The Tenant entity belongs to Platform
 * Management — this endpoint (or a Platform.TenantCreated event) only
 * registers the scope so users and roles can bind to it.
 */
class TenantController
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => TenantScope::orderBy('created_at')->get()]);
    }

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['required', 'uuid'],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $scope = DB::transaction(function () use ($data, $events) {
            $scope = TenantScope::firstOrCreate(['id' => $data['tenant_id']], ['name' => $data['name'] ?? null]);

            if ($scope->wasRecentlyCreated) {
                $events->record('Identity.TenantScopeRegistered', [
                    'tenant_id' => $scope->id,
                    'name' => $scope->name,
                ], $scope->id);
            }

            return $scope;
        });

        return response()->json(['data' => $scope], $scope->wasRecentlyCreated ? 201 : 200);
    }
}
