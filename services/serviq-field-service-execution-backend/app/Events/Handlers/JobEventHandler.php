<?php

namespace App\Events\Handlers;

use App\Models\Execution;
use App\Models\JobWorkflow;
use Illuminate\Support\Facades\Log;

/**
 * Assignment.Accepted → open an execution for (job, agent), seeded with
 * the steps Job.Requested delivered earlier. Job.* events keep the
 * workflow-instance snapshot current.
 */
class JobEventHandler
{
    public function handle(array $envelope): void
    {
        $p = $envelope['payload'] ?? [];
        $type = $envelope['type'];

        if ($type === 'Assignment.Accepted') {
            if (empty($p['job_id']) || empty($p['agent_id'])) {
                throw new \RuntimeException('Assignment.Accepted missing job_id/agent_id');
            }
            $steps = JobWorkflow::find($p['job_id'])?->steps;
            $execution = Execution::firstOrCreate(
                ['job_id' => $p['job_id']],
                [
                    'tenant_id' => $envelope['tenant_id'],
                    'agent_id' => $p['agent_id'],
                    'assignment_id' => $p['assignment_id'] ?? null,
                    'status' => 'assigned',
                    'workflow_instance' => $steps ? array_map(fn ($s) => $s + ['state' => 'open'], $steps) : null,
                ],
            );
            // Dispatcher reassign (ADR-0024): the execution exists under the
            // previous agent — hand the open field session to the new agent
            // so it appears in their work list. Closed executions untouched.
            if (! $execution->wasRecentlyCreated
                && $execution->agent_id !== $p['agent_id']
                && ! in_array($execution->status, ['completed', 'cancelled'], true)) {
                $execution->update([
                    'agent_id' => $p['agent_id'],
                    'assignment_id' => $p['assignment_id'] ?? $execution->assignment_id,
                ]);
            }
            Log::info("Execution opened for job {$p['job_id']}");

            return;
        }

        // Job.* — track the live workflow instance on the execution.
        $jobId = $p['job_id'] ?? null;
        if ($jobId === null) {
            return;
        }
        if ($type === 'Job.Requested' && isset($p['steps'])) {
            JobWorkflow::updateOrCreate(
                ['job_id' => $jobId],
                ['tenant_id' => $envelope['tenant_id'], 'steps' => $p['steps']],
            );
        }
        $execution = Execution::where('job_id', $jobId)->first();
        if ($execution === null) {
            return;
        }
        // A job cancelled mid-flight leaves the agent's active work.
        if ($type === 'Job.Cancelled') {
            if ($execution->status !== 'completed') {
                $execution->update(['status' => 'cancelled']);
            }

            return;
        }
        if ($type === 'Job.Requested' && isset($p['steps'])) {
            $execution->update(['workflow_instance' => array_map(fn ($s) => $s + ['state' => 'open'], $p['steps'])]);
        }
        if ($type === 'Job.WorkflowStepStarted' || $type === 'Job.WorkflowStepCompleted') {
            $steps = $execution->workflow_instance ?? [];
            $pos = $p['step_position'] ?? null;
            if (isset($steps[$pos])) {
                $steps[$pos]['state'] = $type === 'Job.WorkflowStepStarted' ? 'in-progress' : 'closed';
                $execution->update(['workflow_instance' => $steps]);
            }
        }
    }
}
