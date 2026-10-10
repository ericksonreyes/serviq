<?php

namespace App\Http\Controllers;

use App\Models\CatalogService;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CatalogServiceController
{
    public function index(Request $request, string $tenant): JsonResponse
    {
        $services = CatalogService::where('tenant_id', $tenant)
            ->with('workflowSteps')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $services]);
    }

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['required', 'uuid'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price_cents' => ['nullable', 'integer', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],
            'estimated_minutes' => ['nullable', 'integer', 'min:1'],
            'required_skills' => ['nullable', 'array'],
            'service_areas' => ['nullable', 'array'],
            'steps' => ['nullable', 'array'],
            'steps.*.name' => ['required', 'string', 'max:100'],
            'steps.*.required_evidence' => ['nullable', 'array'],
        ]);

        $service = DB::transaction(function () use ($data, $events) {
            $service = CatalogService::create($data);
            $this->syncSteps($service, $data['steps'] ?? [['name' => 'Booked'], ['name' => 'Serviced']]);

            $events->record('ServiceManagement.ServiceCreated', [
                'service_id' => $service->id,
                'name' => $service->name,
                'steps' => $service->workflowSteps->map(fn ($s) => [
                    'name' => $s->name,
                    'position' => $s->position,
                    'required_evidence' => $s->required_evidence,
                ])->all(),
            ], $service->tenant_id);

            return $service;
        });

        return response()->json(['data' => $service->load('workflowSteps')], 201);
    }

    public function show(string $tenant, CatalogService $service): JsonResponse
    {
        abort_unless($service->tenant_id === $tenant, 404);

        return response()->json(['data' => $service->load('workflowSteps')]);
    }

    public function update(Request $request, string $tenant, CatalogService $service, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($service->tenant_id === $tenant, 404);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price_cents' => ['sometimes', 'integer', 'min:0'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'estimated_minutes' => ['nullable', 'integer', 'min:1'],
            'required_skills' => ['nullable', 'array'],
            'service_areas' => ['nullable', 'array'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $service->update($data);
        $events->record('ServiceManagement.ServiceUpdated', ['service_id' => $service->id], $service->tenant_id);

        return response()->json(['data' => $service->load('workflowSteps')]);
    }

    /**
     * Replace the workflow template. Affects new jobs only — in-flight jobs
     * keep the snapshot they were created with.
     */
    public function reorderSteps(Request $request, string $tenant, CatalogService $service, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($service->tenant_id === $tenant, 404);

        $data = $request->validate([
            'steps' => ['required', 'array', 'min:1'],
            'steps.*.name' => ['required', 'string', 'max:100'],
            'steps.*.required_evidence' => ['nullable', 'array'],
        ]);

        DB::transaction(function () use ($service, $data, $events) {
            $service->workflowSteps()->delete();
            $this->syncSteps($service, $data['steps']);

            $events->record('ServiceManagement.WorkflowTemplateChanged', [
                'service_id' => $service->id,
                'steps' => $service->workflowSteps->map(fn ($s) => [
                    'name' => $s->name, 'position' => $s->position,
                ])->all(),
            ], $service->tenant_id);
        });

        return response()->json(['data' => $service->load('workflowSteps')]);
    }

    private function syncSteps(CatalogService $service, array $steps): void
    {
        foreach (array_values($steps) as $i => $step) {
            $service->workflowSteps()->create([
                'position' => $i,
                'name' => $step['name'],
                'required_evidence' => $step['required_evidence'] ?? null,
            ]);
        }
        $service->unsetRelation('workflowSteps');
    }
}
