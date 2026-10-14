<?php

namespace App\Http\Controllers;

use App\Models\Agent;
use App\Models\Assignment;
use App\Models\AssignmentRule;
use App\Models\DispatchableJob;
use App\Services\DispatchService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class AssignmentController
{
    public function index(Request $request, string $tenant): JsonResponse
    {
        $assignments = Assignment::where('tenant_id', $tenant)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('job_id'), fn ($q, $j) => $q->where('job_id', $j))
            ->when($request->query('agent_id'), fn ($q, $a) => $q->where('agent_id', $a))
            ->latest()
            ->paginate(50);

        return response()->json($assignments);
    }

    /** The dispatcher queue — jobs ready but not yet assigned. */
    public function queue(string $tenant): JsonResponse
    {
        $jobs = DispatchableJob::where('tenant_id', $tenant)->where('status', 'ready_for_assignment')->get();

        return response()->json(['data' => $jobs]);
    }

    /** Agent's offer list (broadcast offers still live) + open jobs for self-assign. */
    public function offers(Request $request, string $tenant): JsonResponse
    {
        $data = $request->validate(['agent_id' => ['required', 'uuid']]);

        $offers = Assignment::where('tenant_id', $tenant)
            ->where('agent_id', $data['agent_id'])
            ->where('status', Assignment::OFFERED)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->latest()
            ->get();

        return response()->json(['data' => $offers]);
    }

    /** Advisory top-N agents for a job — ranked, reasoned, never assigns. */
    public function recommend(Request $request, string $tenant, DispatchService $dispatch): JsonResponse
    {
        $data = $request->validate([
            'job_id' => ['required', 'uuid'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);
        $job = $this->dispatchable($tenant, $data['job_id']);

        return response()->json(['data' => $dispatch->recommend($job, $data['limit'] ?? 5)]);
    }

    /** Dispatcher assignment — explicit pick. */
    public function assign(Request $request, string $tenant, DispatchService $dispatch): JsonResponse
    {
        $data = $request->validate([
            'job_id' => ['required', 'uuid'],
            'agent_id' => ['required', 'uuid', 'exists:agents,agent_id'],
        ]);
        $job = $this->dispatchable($tenant, $data['job_id']);

        if ($job->status === 'assigned') {
            return response()->json([
                'error' => 'job_already_assigned',
                'message' => 'This job is already assigned to an agent.',
            ], 409);
        }

        try {
            return response()->json(['data' => $dispatch->createAccepted($job, $data['agent_id'], 'dispatcher')], 201);
        } catch (UniqueConstraintViolationException) {
            return response()->json([
                'error' => 'job_already_assigned',
                'message' => 'This job was assigned just now — refresh to see the current agent.',
            ], 409);
        }
    }

    /** Broadcast a job's offers (manual trigger or strategy=broadcast). */
    public function broadcast(Request $request, string $tenant, DispatchService $dispatch): JsonResponse
    {
        $data = $request->validate([
            'job_id' => ['required', 'uuid'],
            'ttl_seconds' => ['nullable', 'integer', 'min:5', 'max:86400'],
        ]);
        $job = $this->dispatchable($tenant, $data['job_id']);

        if ($job->status === 'assigned') {
            return response()->json([
                'error' => 'job_already_assigned',
                'message' => 'This job is already assigned to an agent.',
            ], 409);
        }

        $ttl = $data['ttl_seconds'] ?? AssignmentRule::find($tenant)?->offer_ttl_seconds ?? 60;

        return response()->json(['data' => $dispatch->broadcast($job, $ttl)], 201);
    }

    /**
     * Dispatcher reassign — swap the accepted agent on any open job:
     * dispatch-committed, agent-accepted, or in-flight. Once the job closes,
     * reassignment is no longer possible (ADR-0024).
     */
    public function reassign(Request $request, string $tenant, DispatchService $dispatch): JsonResponse
    {
        $data = $request->validate([
            'job_id' => ['required', 'uuid'],
            'agent_id' => ['required', 'uuid', 'exists:agents,agent_id'],
        ]);
        $job = $this->dispatchable($tenant, $data['job_id']);

        if (in_array($job->status, ['assigned', 'agent_accepted', 'in_progress'], true)) {
            try {
                return response()->json(['data' => $dispatch->reassign($job, $data['agent_id'])]);
            } catch (UniqueConstraintViolationException) {
                return response()->json([
                    'error' => 'job_already_assigned',
                    'message' => 'Assignment changed just now — refresh to see the current agent.',
                ], 409);
            }
        }

        if (in_array($job->status, ['pending', 'ready_for_assignment'], true)) {
            return response()->json([
                'error' => 'job_not_assigned',
                'message' => 'This job is not assigned yet — use assign.',
            ], 409);
        }

        return response()->json([
            'error' => 'reassign_window_closed',
            'message' => 'The job is closed — reassignment is no longer possible.',
        ], 409);
    }

    /** Agent accepts an offer — exactly one can win. */
    public function accept(Request $request, string $tenant, Assignment $assignment, DispatchService $dispatch): JsonResponse
    {
        abort_unless($assignment->tenant_id === $tenant, 404);
        $data = $request->validate(['agent_id' => ['required', 'uuid']]);

        try {
            $won = $dispatch->accept($assignment->id, $data['agent_id']);
        } catch (RuntimeException $e) {
            return response()->json(['error' => 'offer_not_live', 'message' => $e->getMessage()], 409);
        }

        return response()->json(['data' => $won]);
    }

    public function reject(Request $request, string $tenant, Assignment $assignment, DispatchService $dispatch): JsonResponse
    {
        abort_unless($assignment->tenant_id === $tenant, 404);
        $data = $request->validate(['agent_id' => ['required', 'uuid']]);

        return response()->json(['data' => $dispatch->reject($assignment->id, $data['agent_id'])]);
    }

    /** Self-assignment: an agent claims an open job — same race guard. */
    public function selfAssign(Request $request, string $tenant, DispatchService $dispatch): JsonResponse
    {
        $data = $request->validate([
            'job_id' => ['required', 'uuid'],
            'agent_id' => ['required', 'uuid', 'exists:agents,agent_id'],
        ]);

        // Only meaningful under the `self` strategy — under broadcast a
        // claim would steal a job with live offers; under dispatcher it
        // bypasses the human gate entirely.
        $strategy = AssignmentRule::find($tenant)?->strategy ?? 'automatic';
        if ($strategy !== 'self') {
            return response()->json([
                'error' => 'self_assign_disabled',
                'message' => 'Self-assign is not enabled — jobs are allocated by the configured dispatch strategy.',
            ], 409);
        }
        $job = DispatchableJob::where('job_id', $data['job_id'])->where('tenant_id', $tenant)
            ->where('status', 'ready_for_assignment')->firstOrFail();

        try {
            $assignment = DB::transaction(function () use ($job, $data, $dispatch) {
                $offer = Assignment::create([
                    'job_id' => $job->job_id,
                    'tenant_id' => $job->tenant_id,
                    'agent_id' => $data['agent_id'],
                    'strategy' => 'self',
                    'status' => Assignment::OFFERED,
                ]);

                return $dispatch->accept($offer->id, $data['agent_id']);
            });
        } catch (RuntimeException $e) {
            return response()->json(['error' => 'job_taken', 'message' => $e->getMessage()], 409);
        }

        return response()->json(['data' => $assignment], 201);
    }

    /** Current tenant dispatch rules — the automatic default until configured. */
    /**
     * Released jobs reach Dispatch by event, a few seconds after release.
     * Stays 404 (no existence leak) but tells the dispatcher what to do.
     */
    private function dispatchable(string $tenant, string $jobId): DispatchableJob
    {
        return DispatchableJob::where('job_id', $jobId)->where('tenant_id', $tenant)->first()
            ?? abort(404, 'This job has not reached dispatch yet — it appears a few seconds after release. Try again shortly.');
    }

    public function rules(string $tenant): JsonResponse
    {
        $rule = AssignmentRule::find($tenant)
            ?? new AssignmentRule(['tenant_id' => $tenant, 'strategy' => 'automatic', 'offer_ttl_seconds' => 60]);

        return response()->json(['data' => $rule]);
    }

    /** Tenant dispatch rules. */
    public function configure(Request $request, string $tenant): JsonResponse
    {
        $data = $request->validate([
            'strategy' => ['required', 'in:automatic,broadcast,self,dispatcher'],
            'offer_ttl_seconds' => ['nullable', 'integer', 'min:5', 'max:86400'],
            'fallback' => ['nullable', 'array'],
        ]);

        $rule = AssignmentRule::updateOrCreate(['tenant_id' => $tenant], $data);

        return response()->json(['data' => $rule]);
    }
}
