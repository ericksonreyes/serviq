<?php

namespace Tests\Feature;

use App\Domain\Jobs\JobLifecycle;
use App\Events\Handlers\ExecutionEventHandler;
use App\Models\Job;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The agent's explicit completion (Execution.Completed) completes the job
 * even when workflow steps were skipped — and is a no-op once terminal.
 */
class ExecutionCompletedTest extends TestCase
{
    use RefreshDatabase;

    private function job(string $status): Job
    {
        return Job::create([
            'id' => (string) Str::uuid7(), 'tenant_id' => (string) Str::uuid7(),
            'status' => $status, 'version' => 5,
            'assigned_agent_id' => (string) Str::uuid7(), 'customer_id' => (string) Str::uuid7(),
        ]);
    }

    private function completed(Job $job): void
    {
        app(ExecutionEventHandler::class)->handle([
            'type' => 'Execution.Completed', 'tenant_id' => $job->tenant_id,
            'payload' => ['job_id' => $job->id, 'agent_id' => $job->assigned_agent_id],
        ]);
    }

    public function test_execution_completed_completes_an_in_progress_job(): void
    {
        $job = $this->job(JobLifecycle::IN_PROGRESS);

        $this->completed($job);

        $this->assertSame(JobLifecycle::COMPLETED, $job->fresh()->status);
        $this->assertDatabaseHas('job_events', ['job_id' => $job->id, 'type' => 'Job.Completed']);
        $this->assertDatabaseHas('outbox', ['type' => 'Job.Completed']);
    }

    public function test_execution_completed_is_ignored_for_terminal_jobs(): void
    {
        $job = $this->job(JobLifecycle::COMPLETED);

        $this->completed($job);

        $this->assertSame(5, $job->fresh()->version);
        $this->assertDatabaseMissing('job_events', ['job_id' => $job->id]);
    }
}
