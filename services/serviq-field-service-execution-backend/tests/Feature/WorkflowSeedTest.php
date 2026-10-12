<?php

namespace Tests\Feature;

use App\Events\Handlers\JobEventHandler;
use App\Models\Execution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Job.Requested arrives before Assignment.Accepted opens the execution —
 * the execution must still start with the job's workflow steps.
 */
class WorkflowSeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_execution_is_seeded_with_steps_requested_earlier(): void
    {
        $tenant = (string) Str::uuid7();
        $job = (string) Str::uuid7();
        $handler = app(JobEventHandler::class);

        $handler->handle(['type' => 'Job.Requested', 'tenant_id' => $tenant, 'payload' => [
            'job_id' => $job, 'steps' => [['name' => 'Inspect'], ['name' => 'Repair']],
        ]]);
        $handler->handle(['type' => 'Assignment.Accepted', 'tenant_id' => $tenant, 'payload' => [
            'job_id' => $job, 'agent_id' => (string) Str::uuid7(),
        ]]);

        $this->assertSame(
            [['name' => 'Inspect', 'state' => 'open'], ['name' => 'Repair', 'state' => 'open']],
            Execution::where('job_id', $job)->first()->workflow_instance,
        );
    }

    public function test_job_cancelled_cancels_an_open_execution_but_not_a_completed_one(): void
    {
        $handler = app(JobEventHandler::class);
        $tenant = (string) Str::uuid7();
        foreach (['assigned' => 'cancelled', 'completed' => 'completed'] as $from => $to) {
            $job = (string) Str::uuid7();
            $handler->handle(['type' => 'Assignment.Accepted', 'tenant_id' => $tenant,
                'payload' => ['job_id' => $job, 'agent_id' => (string) Str::uuid7()]]);
            Execution::where('job_id', $job)->update(['status' => $from]);

            $handler->handle(['type' => 'Job.Cancelled', 'tenant_id' => $tenant, 'payload' => ['job_id' => $job]]);

            $this->assertSame($to, Execution::where('job_id', $job)->first()->status);
        }
    }
}
