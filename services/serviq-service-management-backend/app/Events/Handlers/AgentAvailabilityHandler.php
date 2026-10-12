<?php

namespace App\Events\Handlers;

use App\Models\ProjectedAgentAvailability;
use Illuminate\Support\Facades\Log;

/**
 * Workforce.AgentRegistered/AgentUpdated → agent availability projection.
 * The agent's slots are rewritten wholesale — events carry the full
 * schedule, so a delete+insert is idempotent and self-healing.
 */
class AgentAvailabilityHandler
{
    public function handle(array $envelope): void
    {
        $p = $envelope['payload'] ?? [];
        if (empty($p['agent_id'])) {
            throw new \RuntimeException($envelope['type'].' missing agent_id');
        }

        ProjectedAgentAvailability::where('agent_id', $p['agent_id'])->delete();

        foreach ($p['availability'] ?? [] as $slot) {
            ProjectedAgentAvailability::create([
                'tenant_id' => $envelope['tenant_id'],
                'agent_id' => $p['agent_id'],
                'day_of_week' => $slot['day_of_week'],
                'start_time' => $slot['start_time'],
                'end_time' => $slot['end_time'],
                'status' => $p['status'] ?? 'active',
                'capacity' => max(1, (int) ($p['capacity'] ?? 1)),
            ]);
        }

        Log::info("Agent availability projected: {$p['agent_id']}");
    }
}
