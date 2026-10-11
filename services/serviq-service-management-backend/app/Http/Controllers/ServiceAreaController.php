<?php

namespace App\Http\Controllers;

use App\Models\ServiceArea;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Tenant service-area configuration — the areas a provider covers. */
class ServiceAreaController
{
    public function index(string $tenant): JsonResponse
    {
        $areas = ServiceArea::where('tenant_id', $tenant)->orderBy('name')->get();

        return response()->json(['data' => $areas]);
    }

    public function store(Request $request, string $tenant, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'geo' => ['nullable', 'array'],
        ]);

        $area = ServiceArea::create($data + ['tenant_id' => $tenant]);
        $events->record('ServiceManagement.ServiceAreaCreated', [
            'service_area_id' => $area->id, 'name' => $area->name,
        ], $tenant);

        return response()->json(['data' => $area], 201);
    }

    public function update(Request $request, string $tenant, ServiceArea $serviceArea, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($serviceArea->tenant_id === $tenant, 404);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'geo' => ['nullable', 'array'],
        ]);

        $serviceArea->update($data);
        $events->record('ServiceManagement.ServiceAreaUpdated', [
            'service_area_id' => $serviceArea->id,
        ], $tenant);

        return response()->json(['data' => $serviceArea]);
    }

    public function destroy(string $tenant, ServiceArea $serviceArea, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($serviceArea->tenant_id === $tenant, 404);

        $serviceArea->delete();
        $events->record('ServiceManagement.ServiceAreaDeleted', [
            'service_area_id' => $serviceArea->id, 'name' => $serviceArea->name,
        ], $tenant);

        return response()->json(['data' => ['id' => $serviceArea->id, 'deleted' => true]]);
    }
}
