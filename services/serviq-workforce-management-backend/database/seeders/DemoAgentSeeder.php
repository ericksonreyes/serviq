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
        $agent = Agent::firstOrCreate(
            ['tenant_id' => self::DEMO_TENANT_ID, 'name' => 'Anna Agent'],
            [
                'skills' => ['ac-cleaning', 'plumbing', 'deep-cleaning'],
                'service_areas' => ['Antipolo', 'Cainta'],
                'capacity' => 3,
                'status' => 'active',
            ],
        );

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
