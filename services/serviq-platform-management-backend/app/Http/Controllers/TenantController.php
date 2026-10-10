<?php

namespace App\Http\Controllers;

use App\Domain\Tenancy\TenantLifecycle;
use App\Models\Tenant;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class TenantController
{
    // The first user provisioned in a self-signup tenant always gets this
    // role — IAM owns the canonical role names; this is the event contract.
    public const ROLE_TENANT_ADMINISTRATOR = 'Tenant Administrator';

    /**
     * Public service-provider self-signup (SERVICE_PROVIDER.MD onboarding).
     * Creates the tenant in PENDING status — the platform reviews and
     * activates it — and rides the first Tenant Administrator along on the
     * creation event; IAM's consumer provisions it into the new scope.
     * The password is hashed here so the outbox row never holds plaintext.
     * Anonymous, throttled like IAM's auth routes.
     */
    public function signup(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:100', 'alpha_dash', 'unique:tenants,slug'],
            'admin_username' => ['required', 'string', 'max:100'],
            'admin_email' => ['required', 'email'],
            'admin_display_name' => ['required', 'string', 'max:255'],
            'admin_password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $tenant = DB::transaction(function () use ($data, $events) {
            $tenant = Tenant::create([
                'name' => $data['name'],
                'slug' => $data['slug'],
                'status' => TenantLifecycle::PENDING,
            ]);

            $events->record('Platform.TenantCreated', [
                'tenant_id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'plan_id' => $tenant->plan_id,
                'initial_users' => [[
                    'username' => $data['admin_username'],
                    'email' => $data['admin_email'],
                    'display_name' => $data['admin_display_name'],
                    'password' => Hash::make($data['admin_password']),
                    'role' => self::ROLE_TENANT_ADMINISTRATOR,
                ]],
            ], $tenant->id);

            return $tenant;
        });

        return response()->json(['data' => $tenant], 201);
    }

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
