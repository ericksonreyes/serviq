<?php

namespace App\Events\Handlers;

use App\Domain\Jobs\JobLifecycle;
use App\Models\Job;
use App\Services\JobStore;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Assignment.Accepted → Job.Assigned, or Job.Reassigned when a dispatcher
 * swaps the agent on an open job (ADR-0024). Assignment owns the decision;
 * the job lifecycle advances by event, not by cross-service call.
 */
class AssignmentAcceptedHandler
{
    public function handle(array $envelope): void
    {
        $payload = $envelope['payload'] ?? [];
        $jobId = $payload['job_id'] ?? null;
        $agentId = $payload['agent_id'] ?? null;
        if ($jobId === null || $agentId === null) {
            throw new \RuntimeException('Assignment.Accepted missing job_id/agent_id');
        }

        $job = Job::find($jobId);
        if ($job === null) {
            return;
        }

        // Assigned to the same agent → duplicate event, drop it. Closed jobs
        // → a late Accepted must not reopen them. A *different* agent on any
        // open job → dispatcher reassign (ADR-0024): record Job.Reassigned,
        // which moves assigned_agent_id without rewinding the lifecycle
        // (Job.Assigned would drag an in-progress job back to 'assigned').
        if ($job->assigned_agent_id === $agentId) {
            return;
        }
        if (in_array($job->status, JobLifecycle::TERMINAL, true)) {
            return;
        }

        $store = app(JobStore::class);
        DB::transaction(fn () => $job->assigned_agent_id === null
            ? $store->record($job, 'Job.Assigned', ['agent_id' => $agentId])
            : $store->record($job, 'Job.Reassigned', [
                'agent_id' => $agentId,
                'previous_agent_id' => $job->assigned_agent_id,
            ]));
        Log::info("Job {$jobId} assigned to {$agentId}");
    }
}
