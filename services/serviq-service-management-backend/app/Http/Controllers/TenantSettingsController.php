<?php

namespace App\Http\Controllers;

use App\Models\TenantSetting;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Tenant business settings — free-form JSON owned by this context:
 * operating_hours ({monday:{open,close},...}), cancellation_policy (text),
 * crews, and operational flags. Availability reads operating_hours here.
 */
class TenantSettingsController
{
    public function show(string $tenant): JsonResponse
    {
        $settings = TenantSetting::where('tenant_id', $tenant)->first();

        return response()->json(['data' => [
            'tenant_id' => $tenant,
            'settings' => $settings?->settings ?? new \stdClass,
        ]]);
    }

    public function update(Request $request, string $tenant, DomainEventRecorder $events): JsonResponse
    {
        // Accept either {settings: {...}} or the bare settings object.
        $settings = $request->input('settings');
        if (! is_array($settings)) {
            $settings = $request->except(['settings', 'tenant_id']);
        }

        $row = TenantSetting::updateOrCreate(
            ['tenant_id' => $tenant],
            ['settings' => $settings],
        );

        $events->record('ServiceManagement.SettingsUpdated', [
            'keys' => array_keys($settings),
        ], $tenant);

        return response()->json(['data' => [
            'tenant_id' => $tenant,
            'settings' => $row->settings,
        ]]);
    }
}
