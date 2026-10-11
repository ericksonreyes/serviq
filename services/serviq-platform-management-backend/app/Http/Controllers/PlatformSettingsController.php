<?php

namespace App\Http\Controllers;

use App\Models\PlatformSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Platform-wide configuration and policies — a single JSON document at
 * platform scope. PUT accepts {"settings": {...}} or the bare settings
 * object; whatever is stored replaces the document wholesale.
 */
class PlatformSettingsController
{
    public function show(): JsonResponse
    {
        $document = PlatformSetting::document();

        return response()->json([
            'data' => [
                'settings' => $document->settings ?? (object) [],
                'updated_at' => $document->updated_at,
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $settings = $request->input('settings', $request->all());

        if (! is_array($settings)) {
            return response()->json([
                'error' => 'invalid_settings',
                'message' => 'Settings must be a JSON object.',
            ], 422);
        }

        $document = PlatformSetting::document();
        $document->update(['settings' => $settings]);

        return response()->json([
            'data' => [
                'settings' => $document->settings,
                'updated_at' => $document->updated_at,
            ],
        ]);
    }
}
