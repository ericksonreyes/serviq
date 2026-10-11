<?php

namespace App\Services;

use App\Domain\Jobs\JobLifecycle;
use App\Models\Job;
use App\Models\JobEvent;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Event store for jobs: appends to job_events, updates the jobs projection,
 * and records the same event in the outbox — all in one transaction.
 * Replay rebuilds the projection from the stream alone.
 */
class JobStore
{
    private const EVENT_STATUS = [
        'Job.Requested' => JobLifecycle::REQUESTED,
        'Job.Confirmed' => JobLifecycle::CONFIRMED,
        'Job.ReadyForAssignment' => JobLifecycle::READY,
        'Job.Assigned' => JobLifecycle::ASSIGNED,
        'Job.Accepted' => JobLifecycle::ACCEPTED,
        'Job.Started' => JobLifecycle::IN_PROGRESS,
        'Job.Completed' => JobLifecycle::COMPLETED,
        'Job.Cancelled' => JobLifecycle::CANCELLED,
    ];

    public function __construct(private DomainEventRecorder $outbox) {}

    /**
     * Append an event (inside the caller's transaction) and fold it into
     * the projection.
     */
    public function record(Job $job, string $type, array $payload = []): JobEvent
    {
        $seq = $job->version + 1;
        $event = JobEvent::create([
            'job_id' => $job->id,
            'seq' => $seq,
            'type' => $type,
            'payload' => $payload,
            'occurred_at' => now(),
        ]);

        $this->apply($job, $type, $payload);
        $job->version = $seq;
        $job->save();

        $this->outbox->record($type, $payload + ['job_id' => $job->id], $job->tenant_id);

        return $event;
    }

    /** Fold one event into the projection — the only place state changes. */
    public function apply(Job $job, string $type, array $payload): void
    {
        if (isset(self::EVENT_STATUS[$type])) {
            $job->status = self::EVENT_STATUS[$type];
        }
        if ($type === 'Job.Assigned') {
            $job->assigned_agent_id = $payload['agent_id'] ?? $job->assigned_agent_id;
        }
        if ($type === 'Job.Requested') {
            $job->fill([
                'request_id' => $payload['request_id'] ?? null,
                'service_id' => $payload['service_id'] ?? null,
                'customer_id' => $payload['customer_id'] ?? null,
            ]);
            $job->workflow_instance = array_map(fn ($s) => $s + ['state' => 'open'], $payload['steps'] ?? []);
        }
        if ($type === 'Job.WorkflowStepStarted' || $type === 'Job.WorkflowStepCompleted') {
            $steps = $job->workflow_instance ?? [];
            $pos = $payload['step_position'] ?? null;
            if (isset($steps[$pos])) {
                $steps[$pos]['state'] = $type === 'Job.WorkflowStepStarted' ? 'in-progress' : 'closed';
                $job->workflow_instance = $steps;
            }
        }
    }

    /** Rebuild the projection from the stream — the milestone's "replay". */
    public function replay(Job $job): Job
    {
        $job->fill(['status' => JobLifecycle::REQUESTED, 'workflow_instance' => null, 'assigned_agent_id' => null]);
        foreach ($job->events()->get() as $event) {
            $this->apply($job, $event->type, $event->payload);
            $job->version = $event->seq;
        }
        $job->save();

        return $job;
    }

    /** Transition with a guard — throws on illegal moves. */
    public function transition(Job $job, string $eventType, array $payload = []): void
    {
        $target = self::EVENT_STATUS[$eventType] ?? null;
        $lifecycle = new JobLifecycle();
        if ($target === null || ! $lifecycle->canTransition($job->status, $target)) {
            throw new RuntimeException("Illegal job transition: {$job->status} via {$eventType}");
        }
        DB::transaction(fn () => $this->record($job, $eventType, $payload));
    }
}
