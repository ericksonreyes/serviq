<?php

namespace App\Events\Handlers;

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
        if ($job === null || $job->status === 'assigned') {
            return;
        }

        DB::transaction(fn () => app(JobStore::class)->record($job, 'Job.Assigned', ['agent_id' => $agentId]));
        Log::info("Job {$jobId} assigned to {$agentId}");
    }
}
