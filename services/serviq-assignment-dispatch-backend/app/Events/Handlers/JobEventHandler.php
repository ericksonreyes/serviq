<?php

namespace App\Events\Handlers;

use App\Models\DispatchableJob;
use App\Services\DispatchService;
use Illuminate\Support\Facades\Log;

/**
 * Job.* → dispatchable_jobs projection; Job.ReadyForAssignment triggers the
 * tenant's configured strategy.
 */
class JobEventHandler
{
    public function handle(array $envelope): void
    {
        $jobId = $envelope['payload']['job_id'] ?? null;
        if ($jobId === null) {
            throw new \RuntimeException($envelope['type'].' missing job_id');
        }

        $status = match ($envelope['type']) {
            'Job.ReadyForAssignment' => 'ready_for_assignment',
            'Job.Assigned' => 'assigned',
            'Job.Accepted' => 'agent_accepted',
            'Job.Started' => 'in_progress',
            'Job.Completed', 'Job.Cancelled' => 'closed',
            default => null,
        };

        // Only some Job.* events carry service_id, and only lifecycle events
        // move dispatch status — others must not blank or rewind either.
        $job = DispatchableJob::firstOrNew(['job_id' => $jobId]);
        $job->tenant_id = $envelope['tenant_id'];
        $job->service_id = $envelope['payload']['service_id'] ?? $job->service_id;
        $job->status = $status ?? $job->status ?? 'pending';
        $job->save();

        if ($envelope['type'] === 'Job.ReadyForAssignment') {
            app(DispatchService::class)->dispatch($job);
        }
        Log::info("Job {$jobId} → dispatch projection ({$job->status})");
    }
}
