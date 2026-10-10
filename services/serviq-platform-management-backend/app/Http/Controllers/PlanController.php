<?php

namespace App\Http\Controllers;

use App\Models\Plan;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PlanController
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => Plan::orderBy('price_cents')->get()]);
    }

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'alpha_dash', 'unique:plans,code'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price_cents' => ['nullable', 'integer', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],
            'features' => ['nullable', 'array'],
            'active' => ['nullable', 'boolean'],
        ]);

        $plan = DB::transaction(function () use ($data, $events) {
            $plan = Plan::create($data);

            $events->record('Platform.PlanCreated', [
                'plan_id' => $plan->id,
                'code' => $plan->code,
                'name' => $plan->name,
            ]);

            return $plan;
        });

        return response()->json(['data' => $plan], 201);
    }

    public function show(Plan $plan): JsonResponse
    {
        return response()->json(['data' => $plan]);
    }

    public function update(Request $request, Plan $plan): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price_cents' => ['sometimes', 'integer', 'min:0'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'features' => ['nullable', 'array'],
            'active' => ['sometimes', 'boolean'],
            'code' => ['prohibited'],
        ]);

        $plan->update($data);

        return response()->json(['data' => $plan]);
    }
}
