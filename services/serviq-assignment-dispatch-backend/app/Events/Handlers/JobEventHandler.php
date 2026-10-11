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
            'Job.Assigned', 'Job.Accepted' => 'assigned',
            'Job.Completed', 'Job.Cancelled' => 'closed',
            default => null,
        };

        $job = DispatchableJob::updateOrCreate(
            ['job_id' => $jobId],
            [
                'tenant_id' => $envelope['tenant_id'],
                'service_id' => $envelope['payload']['service_id'] ?? null,
                'status' => $status ?? 'ready_for_assignment',
            ],
        );

        if ($envelope['type'] === 'Job.ReadyForAssignment') {
            app(DispatchService::class)->dispatch($job);
        }
        Log::info("Job {$jobId} → dispatch projection ({$job->status})");
    }
}
