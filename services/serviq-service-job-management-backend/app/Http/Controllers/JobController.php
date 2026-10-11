<?php

namespace App\Http\Controllers;

use App\Domain\Jobs\JobLifecycle;
use App\Models\Job;
use App\Services\JobStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class JobController
{
    public function index(Request $request, string $tenant): JsonResponse
    {
        $jobs = Job::where('tenant_id', $tenant)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->latest()
            ->paginate(50);

        return response()->json($jobs);
    }

    public function show(string $tenant, Job $job): JsonResponse
    {
        abort_unless($job->tenant_id === $tenant, 404);

        return response()->json(['data' => $job]);
    }

    /** The job's event stream — the source of truth behind the projection. */
    public function history(string $tenant, Job $job): JsonResponse
    {
        abort_unless($job->tenant_id === $tenant, 404);

        return response()->json(['data' => $job->events()->get(['seq', 'type', 'payload', 'occurred_at'])]);
    }

    /** Rebuild the projection from the event stream (replay). */
    public function replay(string $tenant, Job $job, JobStore $store): JsonResponse
    {
        abort_unless($job->tenant_id === $tenant, 404);

        return response()->json(['data' => $store->replay($job)]);
    }

    public function confirm(string $tenant, Job $job, JobStore $store): JsonResponse
    {
        return $this->transition($tenant, $job, 'Job.Confirmed', [], $store);
    }

    public function ready(string $tenant, Job $job, JobStore $store): JsonResponse
    {
        return $this->transition($tenant, $job, 'Job.ReadyForAssignment', [], $store);
    }

    public function assign(Request $request, string $tenant, Job $job, JobStore $store): JsonResponse
    {
        $data = $request->validate(['agent_id' => ['required', 'uuid']]);

        return $this->transition($tenant, $job, 'Job.Assigned', $data, $store);
    }

    public function accept(string $tenant, Job $job, JobStore $store): JsonResponse
    {
        return $this->transition($tenant, $job, 'Job.Accepted', [], $store);
    }

    public function start(string $tenant, Job $job, JobStore $store): JsonResponse
    {
        return $this->transition($tenant, $job, 'Job.Started', [], $store);
    }

    public function cancel(string $tenant, Job $job, JobStore $store): JsonResponse
    {
        return $this->transition($tenant, $job, 'Job.Cancelled', [], $store);
    }

    /** Generic step events — the step name is payload, not event type. */
    public function stepStart(string $tenant, Job $job, int $position, JobStore $store): JsonResponse
    {
        abort_unless($job->tenant_id === $tenant, 404);
        $this->guardStep($job, $position, 'open');

        DB::transaction(fn () => $store->record($job, 'Job.WorkflowStepStarted', [
            'step_position' => $position,
            'step_name' => $job->workflow_instance[$position]['name'],
        ]));

        return response()->json(['data' => $job->fresh()]);
    }

    public function stepClose(string $tenant, Job $job, int $position, JobStore $store): JsonResponse
    {
        abort_unless($job->tenant_id === $tenant, 404);
        $this->guardStep($job, $position, 'in-progress');

        DB::transaction(function () use ($store, $job, $position) {
            $store->record($job, 'Job.WorkflowStepCompleted', [
                'step_position' => $position,
                'step_name' => $job->workflow_instance[$position]['name'],
            ]);

            $steps = $job->workflow_instance;
            if ($position === count($steps) - 1) {
                $store->record($job, 'Job.Completed', [
                    'agent_id' => $job->assigned_agent_id, 'customer_id' => $job->customer_id,
                ]);
            }
        });

        return response()->json(['data' => $job->fresh()]);
    }

    /** Drag-and-drop reorder of OPEN steps only (in-progress/closed locked). */
    public function reorder(Request $request, string $tenant, Job $job, JobStore $store): JsonResponse
    {
        abort_unless($job->tenant_id === $tenant, 404);
        $data = $request->validate(['order' => ['required', 'array', 'min:1'], 'order.*' => ['integer']]);

        $steps = $job->workflow_instance ?? [];
        if (count($data['order']) !== count($steps)) {
            return response()->json(['error' => 'invalid_order'], 422);
        }
        foreach ($data['order'] as $newIdx => $oldIdx) {
            if (($steps[$oldIdx]['state'] ?? 'open') !== 'open' && $newIdx !== $oldIdx) {
                return response()->json(['error' => 'step_locked', 'message' => "Step {$oldIdx} is not open"], 409);
            }
        }
        $reordered = array_map(fn ($oldIdx) => $steps[$oldIdx], $data['order']);
        $job->workflow_instance = $reordered;
        DB::transaction(fn () => $store->record($job, 'Job.WorkflowReordered', [
            'order' => $data['order'],
        ]));
        $job->refresh();

        return response()->json(['data' => $job]);
    }

    private function transition(string $tenant, Job $job, string $event, array $payload, JobStore $store): JsonResponse
    {
        abort_unless($job->tenant_id === $tenant, 404);
        try {
            $store->transition($job, $event, $payload);
        } catch (RuntimeException $e) {
            return response()->json(['error' => 'illegal_transition', 'message' => $e->getMessage()], 409);
        }

        return response()->json(['data' => $job->fresh()]);
    }

    private function guardStep(Job $job, int $position, string $expected): void
    {
        $steps = $job->workflow_instance ?? [];
        abort_unless(isset($steps[$position]), 404, 'No such step');
        if ($job->status !== JobLifecycle::IN_PROGRESS) {
            abort(409, 'Job is not in progress');
        }
        if ($steps[$position]['state'] !== $expected) {
            abort(409, "Step {$position} is {$steps[$position]['state']}, expected {$expected}");
        }
    }
}
