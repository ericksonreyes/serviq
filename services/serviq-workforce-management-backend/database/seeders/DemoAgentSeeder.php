<?php

namespace Database\Seeders;

use App\Models\Agent;
use Illuminate\Database\Seeder;

/**
 * Demo field agent for the "Acme Services" tenant (root README's Local seed accounts section).
 * DEMO_TENANT_ID matches DemoTenantSeeder's fixed UUID in
 * platform-management. The agent mirrors anna.agent's IAM account —
 * user_id is left null ("when linked") since IAM assigns it at provision
 * time. Weekday 08:00–17:00 availability.
 */
class DemoAgentSeeder extends Seeder
{
    public const DEMO_TENANT_ID = '01ac0000-0000-7000-8000-00000000acde';

    public function run(): void
    {
        // Link anna.agent's IAM login to this workforce record — the
        // agent BFF resolves JWT sub → agents.user_id → agents.id.
        // IAM's user id is generated at provision time, so look it up
        // cross-database (same Postgres server, same credentials).
        $iamUserId = null;
        try {
            $pdo = new \PDO(
                sprintf('pgsql:host=%s;port=%s;dbname=serviq_identity', env('DB_HOST', 'postgres'), env('DB_PORT', 5432)),
                env('DB_USERNAME', 'serviq'), env('DB_PASSWORD', 'serviq'),
            );
            $iamUserId = $pdo->query(
                sprintf("SELECT id FROM users WHERE username = 'anna.agent' AND scope = '%s'", self::DEMO_TENANT_ID)
            )->fetchColumn() ?: null;
        } catch (\Throwable) {
            // IAM not reachable yet — agent stays unlinked, BFF degrades.
        }

        $agent = Agent::firstOrCreate(
            ['tenant_id' => self::DEMO_TENANT_ID, 'name' => 'Anna Agent'],
            [
                'user_id' => $iamUserId,
                'skills' => ['ac-cleaning', 'plumbing', 'deep-cleaning'],
                'service_areas' => ['Antipolo', 'Cainta'],
                'capacity' => 3,
                'status' => 'active',
            ],
        );
        if ($iamUserId && $agent->user_id !== $iamUserId) {
            $agent->update(['user_id' => $iamUserId]);
        }

        // Seed via outbox — consumers (dispatch's agents projection) need
        // Workforce.AgentRegistered or the demo agent can't be assigned.
        app(\App\Services\DomainEventRecorder::class)->record('Workforce.AgentRegistered', [
            'agent_id' => $agent->id,
            'name' => $agent->name,
            'skills' => $agent->skills,
            'service_areas' => $agent->service_areas,
            'capacity' => $agent->capacity,
            'status' => $agent->status,
        ], $agent->tenant_id);

        if ($agent->wasRecentlyCreated) {
            foreach ([1, 2, 3, 4, 5] as $dayOfWeek) {
                $agent->availability()->create([
                    'day_of_week' => $dayOfWeek,
                    'start_time' => '08:00',
                    'end_time' => '17:00',
                ]);
            }
        }
    }
}
