<?php

namespace App\Http\Controllers;

use App\Domain\Tenancy\TenantLifecycle;
use App\Models\Tenant;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class TenantController
{
    public function index(Request $request): JsonResponse
    {
        $tenants = Tenant::with('plan')
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->orderBy('name')
            ->paginate(50);

        return response()->json($tenants);
    }

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:100', 'alpha_dash', 'unique:tenants,slug'],
            'plan_id' => ['nullable', 'uuid', 'exists:plans,id'],
            'activate' => ['nullable', 'boolean'],
        ]);

        $tenant = DB::transaction(function () use ($data, $events) {
            $tenant = Tenant::create([
                'name' => $data['name'],
                'slug' => $data['slug'],
                'plan_id' => $data['plan_id'] ?? null,
                'status' => TenantLifecycle::PENDING,
            ]);

            $events->record('Platform.TenantCreated', [
                'tenant_id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'plan_id' => $tenant->plan_id,
            ], $tenant->id);

            if ($data['activate'] ?? false) {
                $tenant->transitionTo(TenantLifecycle::ACTIVE);
                $events->record('Platform.TenantActivated', ['tenant_id' => $tenant->id], $tenant->id);
            }

            return $tenant;
        });

        return response()->json(['data' => $tenant->load('plan')], 201);
    }

    public function show(Tenant $tenant): JsonResponse
    {
        return response()->json(['data' => $tenant->load('plan')]);
    }

    public function update(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'plan_id' => ['nullable', 'uuid', 'exists:plans,id'],
        ]);

        $tenant->update($data);

        return response()->json(['data' => $tenant->load('plan')]);
    }

    public function activate(Tenant $tenant, DomainEventRecorder $events): JsonResponse
    {
        return $this->transition($tenant, TenantLifecycle::ACTIVE, 'Platform.TenantActivated', $events);
    }

    public function suspend(Tenant $tenant, DomainEventRecorder $events): JsonResponse
    {
        return $this->transition($tenant, TenantLifecycle::SUSPENDED, 'Platform.TenantSuspended', $events);
    }

    public function deactivate(Tenant $tenant, DomainEventRecorder $events): JsonResponse
    {
        return $this->transition($tenant, TenantLifecycle::DEACTIVATED, 'Platform.TenantDeactivated', $events);
    }

    private function transition(Tenant $tenant, string $to, string $event, DomainEventRecorder $events): JsonResponse
    {
        try {
            DB::transaction(function () use ($tenant, $to, $event, $events) {
                $tenant->transitionTo($to);
                $events->record($event, ['tenant_id' => $tenant->id, 'status' => $to], $tenant->id);
            });
        } catch (RuntimeException $e) {
            return response()->json(['error' => 'illegal_transition', 'message' => $e->getMessage()], 409);
        }

        return response()->json(['data' => $tenant->load('plan')]);
    }
}
