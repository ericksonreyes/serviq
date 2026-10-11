<?php

namespace App\Http\Controllers;

use App\Models\Agent;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AgentController
{
    public function index(Request $request, string $tenant): JsonResponse
    {
        $agents = Agent::with('availability')
            ->where('tenant_id', $tenant)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('user_id'), fn ($q, $u) => $q->where('user_id', $u))
            ->orderBy('name')
            ->paginate(50);

        return response()->json($agents);
    }

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['required', 'uuid'],
            'user_id' => ['nullable', 'uuid'],
            'name' => ['required', 'string', 'max:255'],
            'skills' => ['nullable', 'array'],
            'certifications' => ['nullable', 'array'],
            'service_areas' => ['nullable', 'array'],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:50'],
            'availability' => ['nullable', 'array'],
            'availability.*.day_of_week' => ['required', 'integer', 'between:0,6'],
            'availability.*.start_time' => ['required', 'date_format:H:i'],
            'availability.*.end_time' => ['required', 'date_format:H:i'],
        ]);

        $agent = DB::transaction(function () use ($data, $events) {
            $agent = Agent::create($data);
            foreach ($data['availability'] ?? [] as $slot) {
                $agent->availability()->create($slot);
            }
            $events->record('Workforce.AgentRegistered', $this->payload($agent), $agent->tenant_id);

            return $agent;
        });

        return response()->json(['data' => $agent->load('availability')], 201);
    }

    public function show(string $tenant, Agent $agent): JsonResponse
    {
        abort_unless($agent->tenant_id === $tenant, 404);

        return response()->json(['data' => $agent->load('availability')]);
    }

    public function update(Request $request, string $tenant, Agent $agent, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($agent->tenant_id === $tenant, 404);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'skills' => ['nullable', 'array'],
            'certifications' => ['nullable', 'array'],
            'service_areas' => ['nullable', 'array'],
            'capacity' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'status' => ['sometimes', 'in:active,inactive'],
            'availability' => ['nullable', 'array'],
            'availability.*.day_of_week' => ['required', 'integer', 'between:0,6'],
            'availability.*.start_time' => ['required', 'date_format:H:i'],
            'availability.*.end_time' => ['required', 'date_format:H:i'],
        ]);

        DB::transaction(function () use ($agent, $data, $events) {
            if (array_key_exists('availability', $data)) {
                $agent->availability()->delete();
                foreach ($data['availability'] ?? [] as $slot) {
                    $agent->availability()->create($slot);
                }
                unset($data['availability']);
            }
            $agent->update($data);
            $events->record('Workforce.AgentUpdated', $this->payload($agent->fresh('availability')), $agent->tenant_id);
        });

        return response()->json(['data' => $agent->load('availability')]);
    }

    /** Capability query used by dispatch UIs: who can do this job? */
    public function eligible(Request $request, string $tenant): JsonResponse
    {
        $request->validate(['skills' => ['nullable', 'array'], 'area' => ['nullable', 'string']]);

        $agents = Agent::where('tenant_id', $tenant)->where('status', 'active')->get()
            ->filter->isCapableOf($request->input('skills', []), $request->input('area'))
            ->values();

        return response()->json(['data' => $agents]);
    }

    private function payload(Agent $agent): array
    {
        return [
            'agent_id' => $agent->id,
            'name' => $agent->name,
            'skills' => $agent->skills,
            'service_areas' => $agent->service_areas,
            'capacity' => $agent->capacity,
            'status' => $agent->status,
        ];
    }
}
