<?php

namespace App\Events\Handlers;

use App\Models\Execution;
use Illuminate\Support\Facades\Log;

/**
 * Assignment.Accepted → open an execution for (job, agent).
 * Job.* events keep the workflow-instance snapshot current.
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
            Execution::firstOrCreate(
                ['job_id' => $p['job_id']],
                [
                    'tenant_id' => $envelope['tenant_id'],
                    'agent_id' => $p['agent_id'],
                    'assignment_id' => $p['assignment_id'] ?? null,
                    'status' => 'assigned',
                ],
            );
            Log::info("Execution opened for job {$p['job_id']}");

            return;
        }

        // Job.* — track the live workflow instance on the execution.
        $jobId = $p['job_id'] ?? null;
        if ($jobId === null) {
            return;
        }
        $execution = Execution::where('job_id', $jobId)->first();
        if ($execution === null) {
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
