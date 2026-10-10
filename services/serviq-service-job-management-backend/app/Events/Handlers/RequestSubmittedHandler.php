<?php

namespace App\Events\Handlers;

use App\Domain\Jobs\JobLifecycle;
use App\Models\Job;
use App\Models\ServiceTemplate;
use App\Services\JobStore;
use Illuminate\Support\Facades\Log;

/**
 * Request.Submitted → create a Service Job in `requested` status, copying
 * the service's workflow template into the job's workflow instance.
 * request → job via event (the milestone).
 */
class RequestSubmittedHandler
{
    public function handle(array $envelope): void
    {
        $payload = $envelope['payload'] ?? [];
        $requestId = $payload['request_id'] ?? null;
        if ($requestId === null) {
            throw new \RuntimeException('Request.Submitted missing request_id');
        }

        // Idempotent beyond the dedupe table: one job per request.
        if (Job::where('request_id', $requestId)->exists()) {
            Log::info("Job already exists for request {$requestId}");

            return;
        }

        $template = isset($payload['service_id'])
            ? ServiceTemplate::find($payload['service_id'])
            : null;
        $steps = $template?->steps ?? [['name' => 'Booked'], ['name' => 'Serviced']];

        $job = Job::create([
            'tenant_id' => $envelope['tenant_id'],
            'status' => JobLifecycle::REQUESTED,
            'version' => 0,
        ]);

        app(JobStore::class)->record($job, 'Job.Requested', [
            'request_id' => $requestId,
            'service_id' => $payload['service_id'] ?? null,
            'customer_id' => $payload['customer_id'] ?? null,
            'details' => $payload['details'] ?? null,
            'steps' => $steps,
        ]);

        Log::info("Job {$job->id} created from request {$requestId}");
    }
}
