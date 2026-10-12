<?php

namespace App\Http\Controllers;

use App\Models\FeatureFlag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FeatureFlagController
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => FeatureFlag::orderBy('key')->get()]);
    }

    // Public status probe — portals/BFFs consult this to gate themselves.
    // Boolean only; no description (internal notes stay internal).
    public function status(string $key): JsonResponse
    {
        $flag = FeatureFlag::where('key', $key)->firstOrFail();

        return response()->json(['data' => ['key' => $flag->key, 'enabled' => $flag->enabled]]);
    }

    public function upsert(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:100'],
            'enabled' => ['required', 'boolean'],
            'description' => ['nullable', 'string'],
        ]);

        $flag = FeatureFlag::updateOrCreate(['key' => $data['key']], $data);

        return response()->json(['data' => $flag]);
    }
}
