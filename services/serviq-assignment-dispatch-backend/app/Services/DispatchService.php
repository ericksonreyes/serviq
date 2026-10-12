<?php

namespace App\Services;

use App\Domain\Dispatch\AssignmentEngine;
use App\Models\Agent;
use App\Models\Assignment;
use App\Models\AssignmentRule;
use App\Models\DispatchableJob;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class DispatchService
{
    public function __construct(
        private AssignmentEngine $engine,
        private DomainEventRecorder $events,
    ) {}

    /** Run the tenant's configured strategy for a ready job. */
    public function dispatch(DispatchableJob $job): void
    {
        $rule = AssignmentRule::find($job->tenant_id) ?? new AssignmentRule(['strategy' => 'automatic', 'offer_ttl_seconds' => 60]);

        match ($rule->strategy) {
            'broadcast' => $this->broadcast($job, $rule->offer_ttl_seconds),
            'self' => null,                             // agents pull from the open list
            'dispatcher' => null,                       // dispatcher assigns explicitly
            default => $this->automatic($job),
        };
    }

    /** Automatic: pick the best eligible agent → Assignment.Accepted. */
    public function automatic(DispatchableJob $job): ?Assignment
    {
        $ranked = $this->engine->rank($this->candidates($job));
        if ($ranked === []) {
            // Fallback: leave the job for a dispatcher (Automatic → Dispatcher Queue).
            $this->events->record('Assignment.Unassigned', ['job_id' => $job->job_id, 'reason' => 'no_eligible_agents'], $job->tenant_id);

            return null;
        }

        return $this->createAccepted($job, $ranked[0]->agent_id, 'automatic');
    }

    /** Broadcast: offer to all eligible agents; first valid accept wins. */
    public function broadcast(DispatchableJob $job, int $ttlSeconds = 60): array
    {
        $candidates = $this->engine->rank($this->candidates($job));
        $offers = DB::transaction(function () use ($candidates, $job, $ttlSeconds) {
            $offers = [];
            foreach (array_slice($candidates, 0, 10) as $agent) {
                $offers[] = Assignment::create([
                    'job_id' => $job->job_id,
                    'tenant_id' => $job->tenant_id,
                    'agent_id' => $agent->agent_id,
                    'strategy' => 'broadcast',
                    'status' => Assignment::OFFERED,
                    'expires_at' => now()->addSeconds($ttlSeconds),
                ]);
                $this->events->record('Assignment.Offered', [
                    'job_id' => $job->job_id,
                    'agent_id' => $agent->agent_id,
                    'offer_id' => end($offers)->id,
                    'expires_at' => end($offers)->expires_at->toIso8601String(),
                ], $job->tenant_id);
            }

            return $offers;
        });

        return $offers;
    }

    /**
     * Accept — the concurrency story: a guarded UPDATE wins the race; the
     * partial unique index is the backstop. Losers' offers are revoked.
     */
    public function accept(string $assignmentId, string $agentId): Assignment
    {
        return DB::transaction(function () use ($assignmentId, $agentId) {
            $offer = Assignment::where('id', $assignmentId)->lockForUpdate()->firstOrFail();
            if (! $this->engine->offerIsLive($offer) || $offer->agent_id !== $agentId) {
                throw new RuntimeException('Offer is not live');
            }

            // Guarded transition — exactly one agent can pass.
            $won = Assignment::where('id', $offer->id)
                ->where('status', Assignment::OFFERED)
                ->update(['status' => Assignment::ACCEPTED]);
            if ($won !== 1) {
                throw new RuntimeException('Assignment already decided');
            }

            Assignment::where('job_id', $offer->job_id)
                ->where('status', Assignment::OFFERED)
                ->where('id', '!=', $offer->id)
                ->update(['status' => Assignment::REVOKED]);

            // Drop the job from the open pool immediately — the Job.Assigned
            // event will set this again, but until it arrives the queue would
            // still list the job as claimable (createAccepted does the same).
            DispatchableJob::where('job_id', $offer->job_id)->update(['status' => 'assigned']);

            $this->events->record('Assignment.Accepted', [
                'job_id' => $offer->job_id,
                'agent_id' => $agentId,
                'assignment_id' => $offer->id,
            ], $offer->tenant_id);

            return $offer->fresh();
        });
    }

    public function reject(string $assignmentId, string $agentId): Assignment
    {
        $offer = Assignment::where('id', $assignmentId)->where('agent_id', $agentId)->where('status', Assignment::OFFERED)->firstOrFail();
        $offer->update(['status' => Assignment::REJECTED]);
        $this->events->record('Assignment.Rejected', ['job_id' => $offer->job_id, 'agent_id' => $agentId], $offer->tenant_id);

        return $offer;
    }

    /** Dispatcher / direct assignment. */
    public function createAccepted(DispatchableJob $job, string $agentId, string $strategy): Assignment
    {
        return DB::transaction(function () use ($job, $agentId, $strategy) {
            $assignment = Assignment::create([
                'job_id' => $job->job_id,
                'tenant_id' => $job->tenant_id,
                'agent_id' => $agentId,
                'strategy' => $strategy,
                'status' => Assignment::ACCEPTED,
            ]);
            $job->update(['status' => 'assigned']);
            $this->events->record('Assignment.Accepted', [
                'job_id' => $job->job_id,
                'agent_id' => $agentId,
                'assignment_id' => $assignment->id,
                'strategy' => $strategy,
            ], $job->tenant_id);

            return $assignment;
        });
    }

    /**
     * Dispatcher reassign — revoke the current accepted assignment and accept
     * a new pick atomically, so the job never returns to the dispatchable
     * pool (auto-dispatch would snap it back before a human could pick).
     * Only valid while the job is dispatch-committed ('assigned') — once the
     * agent accepts or the job closes, reassignment is a cancel flow.
     */
    public function reassign(DispatchableJob $job, string $agentId): Assignment
    {
        return DB::transaction(function () use ($job, $agentId) {
            $current = Assignment::where('job_id', $job->job_id)
                ->where('status', Assignment::ACCEPTED)
                ->lockForUpdate()
                ->firstOrFail();

            // Idempotent — re-picking the same agent is a no-op.
            if ($current->agent_id === $agentId) {
                return $current;
            }

            $current->update(['status' => Assignment::REVOKED]);
            $this->events->record('Assignment.Revoked', [
                'job_id' => $job->job_id,
                'agent_id' => $current->agent_id,
                'assignment_id' => $current->id,
                'superseded_by' => $agentId,
            ], $job->tenant_id);

            return $this->createAccepted($job, $agentId, 'dispatcher');
        });
    }

    /**
     * Advisory top-N for a job — same eligibility data the automatic strategy
     * uses, with the score decomposed into reasons. Never creates offers or
     * assignments; the dispatcher (or `assign`) still decides.
     */
    public function recommend(DispatchableJob $job, int $limit = 5): array
    {
        $workload = Assignment::where('tenant_id', $job->tenant_id)
            ->whereIn('status', [Assignment::OFFERED, Assignment::ACCEPTED])
            ->selectRaw('agent_id, count(*) as open_count')
            ->groupBy('agent_id')
            ->pluck('open_count', 'agent_id');

        $scored = [];
        foreach ($this->candidates($job) as $agent) {
            $capacity = max(1, (int) ($agent->capacity ?? 5));
            $open = (int) ($workload[$agent->agent_id] ?? 0);
            $headroom = max(0, $capacity - $open);

            $reasons = [
                $open === 0
                    ? 'no open assignments'
                    : "{$open} of {$capacity} assignment slots in use",
            ];
            if (($agent->skills ?? []) !== []) {
                $reasons[] = 'declared skills: '.implode(', ', $agent->skills);
            }
            if (($agent->service_areas ?? []) !== []) {
                $reasons[] = 'covers: '.implode(', ', $agent->service_areas);
            }
            if ($headroom === 0) {
                $reasons[] = 'at capacity';
            }

            $scored[] = [
                'agent_id' => $agent->agent_id,
                'name' => $agent->name,
                'score' => (int) round(($headroom / $capacity) * 100),
                'reasons' => $reasons,
            ];
        }
        usort($scored, fn ($a, $b) => $b['score'] <=> $a['score'] ?: strcmp($a['name'], $b['name']));

        return array_slice($scored, 0, max(1, min($limit, 20)));
    }

    private function candidates(DispatchableJob $job): iterable
    {
        return Agent::where('tenant_id', $job->tenant_id)->where('status', 'active')->get();
    }
}
