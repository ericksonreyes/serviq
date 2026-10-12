<?php

namespace App\Events\Handlers;

use App\Domain\Jobs\JobLifecycle;
use App\Models\Job;
use App\Services\JobStore;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Assignment.Accepted → Job.Assigned. Assignment owns the decision; the job
 * lifecycle advances by event, not by cross-service call.
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

        // Assigned to the same agent → duplicate event, drop it. Past the
        // dispatch-committed window (agent accepted/started/closed) → a late
        // Accepted must not rewind the lifecycle. Assigned to a *different*
        // agent → dispatcher reassign: re-record Job.Assigned with the new
        // agent so the projection follows Assignment's decision.
        if ($job->status === JobLifecycle::ASSIGNED && $job->assigned_agent_id === $agentId) {
            return;
        }
        if (in_array($job->status, [JobLifecycle::ACCEPTED, JobLifecycle::IN_PROGRESS, JobLifecycle::COMPLETED, JobLifecycle::CANCELLED], true)) {
            return;
        }

        DB::transaction(fn () => app(JobStore::class)->record($job, 'Job.Assigned', ['agent_id' => $agentId]));
        Log::info("Job {$jobId} assigned to {$agentId}");
    }
}
