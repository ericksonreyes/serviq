<?php

namespace App\Http\Controllers;

use App\Models\Evidence;
use App\Models\Execution;
use App\Services\DomainEventRecorder;
use App\Services\Storage\ArtifactStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class ExecutionController
{
    public function __construct(private ArtifactStore $artifacts) {}

    public function index(Request $request, string $tenant): JsonResponse
    {
        $executions = Execution::with('evidence')
            ->where('tenant_id', $tenant)
            ->when($request->query('agent_id'), fn ($q, $a) => $q->where('agent_id', $a))
            ->latest()
            ->paginate(50);

        return response()->json($executions);
    }

    public function show(string $tenant, Execution $execution): JsonResponse
    {
        abort_unless($execution->tenant_id === $tenant, 404);

        return response()->json(['data' => $execution->load('evidence')]);
    }

    public function checkIn(string $tenant, Execution $execution, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($execution->tenant_id === $tenant, 404);
        abort_if($execution->status !== 'assigned', 409, 'Already checked in');

        DB::transaction(function () use ($execution, $events) {
            $execution->update(['status' => 'in_progress', 'checked_in_at' => now()]);
            $events->record('Execution.CheckedIn', [
                'job_id' => $execution->job_id,
                'agent_id' => $execution->agent_id,
            ], $execution->tenant_id);
        });

        return response()->json(['data' => $execution]);
    }

    /** An execution's evidence rows, oldest first — photos, signatures, notes, parts. */
    public function evidence(string $tenant, Execution $execution): JsonResponse
    {
        abort_unless($execution->tenant_id === $tenant, 404);

        return response()->json(['data' => $execution->evidence()->oldest()->get()]);
    }

    /** Evidence intake — file to the evidence bucket + structured record. */
    public function uploadEvidence(Request $request, string $tenant, Execution $execution, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($execution->tenant_id === $tenant, 404);
        $data = $request->validate([
            'kind' => ['required', 'in:photo,signature,note,part'],
            'step_position' => ['nullable', 'integer', 'min:0'],
            'file' => ['nullable', 'file', 'max:10240'],
            'data' => ['nullable', 'array'],
        ]);

        $evidence = DB::transaction(function () use ($data, $request, $tenant, $execution, $events) {
            $objectRef = null;
            if ($request->hasFile('file')) {
                try {
                    $objectRef = $this->artifacts->put(
                        $tenant, "executions/{$execution->id}",
                        $request->file('file')->get(), $request->file('file')->hashName(),
                    );
                } catch (RuntimeException) {
                    abort(502, 'Evidence file storage failed');
                }
            }

            $evidence = Evidence::create([
                'execution_id' => $execution->id,
                'tenant_id' => $tenant,
                'step_position' => $data['step_position'] ?? null,
                'kind' => $data['kind'],
                'object_ref' => $objectRef,
                'content_type' => $request->file('file')?->getMimeType(),
                'data' => $data['data'] ?? null,
            ]);

            $events->record('Execution.EvidenceCaptured', [
                'job_id' => $execution->job_id,
                'evidence_id' => $evidence->id,
                'kind' => $evidence->kind,
                'step_position' => $evidence->step_position,
                'object_ref' => $evidence->object_ref,
            ], $tenant);

            return $evidence;
        });

        return response()->json(['data' => $evidence], 201);
    }

    /** Agent advances a workflow step — emitted for Job to consume. */
    public function stepStart(string $tenant, Execution $execution, int $position, DomainEventRecorder $events): JsonResponse
    {
        return $this->step($tenant, $execution, $position, 'Execution.StepStarted', 'open', $events);
    }

    public function stepClose(string $tenant, Execution $execution, int $position, DomainEventRecorder $events): JsonResponse
    {
        return $this->step($tenant, $execution, $position, 'Execution.StepCompleted', 'in-progress', $events);
    }

    private function step(string $tenant, Execution $execution, int $position, string $event, string $expected, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($execution->tenant_id === $tenant, 404);
        $steps = $execution->workflow_instance ?? [];
        abort_unless(isset($steps[$position]), 404);
        abort_if($steps[$position]['state'] !== $expected, 409, "Step {$position} is {$steps[$position]['state']}");

        DB::transaction(function () use ($execution, $position, $event, $steps, $events) {
            $steps[$position]['state'] = $event === 'Execution.StepStarted' ? 'in-progress' : 'closed';
            $execution->update(['workflow_instance' => $steps]);
            $events->record($event, [
                'job_id' => $execution->job_id,
                'step_position' => $position,
                'step_name' => $steps[$position]['name'],
            ], $execution->tenant_id);
        });

        return response()->json(['data' => $execution->fresh()]);
    }

    public function complete(string $tenant, Execution $execution, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($execution->tenant_id === $tenant, 404);
        $execution->update(['status' => 'completed']);
        $events->record('Execution.Completed', ['job_id' => $execution->job_id, 'agent_id' => $execution->agent_id], $execution->tenant_id);

        return response()->json(['data' => $execution]);
    }
}
