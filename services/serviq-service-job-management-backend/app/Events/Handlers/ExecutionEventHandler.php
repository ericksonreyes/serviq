<?php

namespace App\Events\Handlers;

use App\Domain\Jobs\JobLifecycle;
use App\Models\Job;
use App\Services\JobStore;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Execution.* → drive the job lifecycle forward from the agent's actions:
 * CheckedIn → Job.Started; Step* → WorkflowStep*; the final closed step
 * completes the job automatically, and so does the agent's explicit
 * Execution.Completed (which may skip open steps).
 */
class ExecutionEventHandler
{
    private const MAP = [
        'Execution.CheckedIn' => 'Job.Started',
        'Execution.StepStarted' => 'Job.WorkflowStepStarted',
        'Execution.StepCompleted' => 'Job.WorkflowStepCompleted',
        'Execution.Completed' => 'Job.Completed',
    ];

    public function handle(array $envelope): void
    {
        $type = self::MAP[$envelope['type']] ?? null;
        $p = $envelope['payload'] ?? [];
        $jobId = $p['job_id'] ?? null;
        if ($type === null || $jobId === null) {
            return;
        }
        $job = Job::find($jobId);
        if ($job === null || in_array($job->status, JobLifecycle::TERMINAL, true)) {
            return;
        }

        $store = app(JobStore::class);
        DB::transaction(function () use ($store, $job, $type, $p) {
            if ($type === 'Job.Started') {
                // Assigned → Accepted → Started: record the accept implicitly
                // when the assignment flow skipped it.
                if ($job->status === 'assigned') {
                    $store->record($job, 'Job.Accepted', ['agent_id' => $p['agent_id'] ?? $job->assigned_agent_id]);
                }
                $store->record($job, 'Job.Started', $p);
            } elseif ($type === 'Job.Completed') {
                $store->record($job, 'Job.Completed', [
                    'agent_id' => $p['agent_id'] ?? $job->assigned_agent_id, 'customer_id' => $job->customer_id,
                ]);
            } else {
                $store->record($job, $type, $p);
                $steps = $job->workflow_instance ?? [];
                if ($type === 'Job.WorkflowStepCompleted' && ($p['step_position'] ?? -1) === count($steps) - 1) {
                    $store->record($job, 'Job.Completed', [
                        'agent_id' => $job->assigned_agent_id, 'customer_id' => $job->customer_id,
                    ]);
                }
            }
        });
        Log::info("Job {$jobId} ← {$envelope['type']}");
    }
}
