<?php

namespace Tests\Feature;

use App\Domain\Jobs\JobLifecycle;
use App\Events\Handlers\AssignmentAcceptedHandler;
use App\Models\Job;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * ADR-0024 — a dispatcher may reassign on any open job. Assignment.Accepted
 * for a different agent on an in-flight job records Job.Reassigned: the new
 * agent takes over without the lifecycle rewinding to 'assigned'.
 */
class ReassignmentTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = (string) Str::uuid7();
    }

    private function job(array $overrides = []): Job
    {
        return Job::create(array_merge([
            'id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'status' => JobLifecycle::ASSIGNED, 'version' => 3,
            'assigned_agent_id' => (string) Str::uuid7(),
        ], $overrides));
    }

    private function accepted(Job $job, string $agentId): void
    {
        app(AssignmentAcceptedHandler::class)->handle([
            'type' => 'Assignment.Accepted',
            'tenant_id' => $this->tenant,
            'payload' => ['job_id' => $job->id, 'agent_id' => $agentId, 'assignment_id' => (string) Str::uuid7()],
        ]);
    }

    public function test_reassign_on_in_progress_job_swaps_agent_without_rewinding(): void
    {
        $old = (string) Str::uuid7();
        $new = (string) Str::uuid7();
        $job = $this->job(['status' => JobLifecycle::IN_PROGRESS, 'assigned_agent_id' => $old]);

        $this->accepted($job, $new);

        $job->refresh();
        $this->assertSame(JobLifecycle::IN_PROGRESS, $job->status);
        $this->assertSame($new, $job->assigned_agent_id);
        $this->assertDatabaseHas('job_events', [
            'job_id' => $job->id, 'type' => 'Job.Reassigned',
        ]);
        $this->assertDatabaseHas('outbox', ['type' => 'Job.Reassigned']);
    }

    public function test_reassign_on_assigned_job_records_reassigned_not_assigned(): void
    {
        $job = $this->job();
        $new = (string) Str::uuid7();

        $this->accepted($job, $new);

        $job->refresh();
        $this->assertSame(JobLifecycle::ASSIGNED, $job->status);
        $this->assertSame($new, $job->assigned_agent_id);
        $this->assertDatabaseHas('job_events', ['job_id' => $job->id, 'type' => 'Job.Reassigned']);
        $this->assertDatabaseMissing('job_events', ['job_id' => $job->id, 'type' => 'Job.Assigned']);
    }

    public function test_first_assignment_records_assigned(): void
    {
        $job = $this->job(['status' => JobLifecycle::READY, 'assigned_agent_id' => null]);
        $agent = (string) Str::uuid7();

        $this->accepted($job, $agent);

        $job->refresh();
        $this->assertSame(JobLifecycle::ASSIGNED, $job->status);
        $this->assertSame($agent, $job->assigned_agent_id);
        $this->assertDatabaseHas('job_events', ['job_id' => $job->id, 'type' => 'Job.Assigned']);
    }

    public function test_same_agent_is_idempotent_and_terminal_is_dropped(): void
    {
        $agent = (string) Str::uuid7();
        $job = $this->job(['assigned_agent_id' => $agent]);

        $this->accepted($job, $agent);
        $this->assertSame(0, $job->events()->count());

        $closed = $this->job(['status' => JobLifecycle::COMPLETED]);
        $this->accepted($closed, (string) Str::uuid7());
        $this->assertSame($closed->assigned_agent_id, $closed->fresh()->assigned_agent_id);
        $this->assertSame(0, $closed->events()->count());
    }
}
