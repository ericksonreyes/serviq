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
