<?php

namespace App\Domain\Dispatch;

use App\Models\Assignment;

/**
 * Pure eligibility + scoring for the automatic strategy. Capability comes
 * from Workforce's projection; the actual pick is a score — nearest/best-
 * match/least-loaded variants are weightings of these signals.
 */
class AssignmentEngine
{
    /**
     * @param  iterable<object>  $candidates  agent projections
     * @return list<object> ranked best-first
     */
    public function rank(iterable $candidates, array $requiredSkills = [], ?string $area = null, array $workload = []): array
    {
        $scored = [];
        foreach ($candidates as $agent) {
            if (($agent->status ?? 'active') !== 'active') {
                continue;
            }
            if ($requiredSkills !== [] && array_diff($requiredSkills, $agent->skills ?? []) !== []) {
                continue;
            }
            if ($area !== null && ($agent->service_areas ?? []) !== [] && ! in_array($area, $agent->service_areas, true)) {
                continue;
            }
            $load = $workload[$agent->agent_id] ?? 0;
            $skillMatch = count(array_intersect($requiredSkills, $agent->skills ?? []));
            $scored[] = [$agent, ($skillMatch * 100) - ($load * 10)];
        }
        usort($scored, fn ($a, $b) => $b[1] <=> $a[1]);

        return array_column($scored, 0);
    }

    /** Offer validity — an expired offer can never accept. */
    public function offerIsLive(Assignment $offer): bool
    {
        return $offer->status === Assignment::OFFERED
            && ($offer->expires_at === null || $offer->expires_at->isFuture());
    }
}
