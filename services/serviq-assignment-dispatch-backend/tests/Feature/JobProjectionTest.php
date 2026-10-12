<?php

namespace Tests\Feature;

use App\Events\Handlers\JobEventHandler;
use App\Models\DispatchableJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Job.* → dispatchable_jobs: only lifecycle events move dispatch status and
 * events without service_id never blank it — a started job must not
 * reappear in the dispatcher's ready queue.
 */
class JobProjectionTest extends TestCase
{
    use RefreshDatabase;

    private function handle(string $type, array $payload, string $tenant): void
    {
        app(JobEventHandler::class)->handle([
            'id' => (string) Str::uuid7(), 'type' => $type, 'tenant_id' => $tenant, 'payload' => $payload,
        ]);
    }

    public function test_lifecycle_events_drive_status_and_keep_service(): void
    {
        $tenant = (string) Str::uuid7();
        $job = (string) Str::uuid7();
        $service = (string) Str::uuid7();

        $this->handle('Job.Requested', ['job_id' => $job, 'service_id' => $service], $tenant);
        $this->assertSame('pending', DispatchableJob::find($job)->status);

        $this->handle('Job.ReadyForAssignment', ['job_id' => $job, 'service_id' => $service, 'scheduled_for' => null], $tenant);
        $this->assertSame('ready_for_assignment', DispatchableJob::find($job)->status);

        $this->handle('Job.Assigned', ['job_id' => $job, 'agent_id' => (string) Str::uuid7()], $tenant);
        $this->handle('Job.Started', ['job_id' => $job, 'agent_id' => (string) Str::uuid7()], $tenant);

        $row = DispatchableJob::find($job);
        $this->assertSame('assigned', $row->status);
        $this->assertSame($service, $row->service_id);

        $this->handle('Job.Cancelled', ['job_id' => $job, 'reason' => null], $tenant);
        $this->assertSame('closed', DispatchableJob::find($job)->status);
    }
}
