<?php

namespace App\Events\Handlers;

use App\Models\Agent;
use Illuminate\Support\Facades\Log;

/** Workforce.AgentRegistered/Updated → agents projection. */
class AgentProjectionHandler
{
    public function handle(array $envelope): void
    {
        $p = $envelope['payload'] ?? [];
        if (empty($p['agent_id'])) {
            throw new \RuntimeException($envelope['type'].' missing agent_id');
        }

        Agent::updateOrCreate(['agent_id' => $p['agent_id']], [
            'tenant_id' => $envelope['tenant_id'],
            'name' => $p['name'] ?? 'agent',
            'skills' => $p['skills'] ?? [],
            'service_areas' => $p['service_areas'] ?? [],
            'capacity' => $p['capacity'] ?? 5,
            'status' => $p['status'] ?? 'active',
        ]);

        Log::info("Agent projected: {$p['agent_id']}");
    }
}
