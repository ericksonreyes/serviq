<?php

namespace Database\Seeders;

use App\Models\FeatureFlag;
use App\Models\Plan;
use Illuminate\Database\Seeder;

/**
 * Phase-1 bootstrap: the initial subscription plan catalog and platform
 * feature flags. No users here — identity lives in IAM.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            ['code' => 'free', 'name' => 'Free', 'price_cents' => 0, 'currency' => 'PHP',
                'features' => ['max_agents' => 3, 'max_services' => 5]],
            ['code' => 'starter', 'name' => 'Starter', 'price_cents' => 149900, 'currency' => 'PHP',
                'features' => ['max_agents' => 15, 'max_services' => 25]],
            ['code' => 'pro', 'name' => 'Pro', 'price_cents' => 499900, 'currency' => 'PHP',
                'features' => ['max_agents' => 100, 'max_services' => 200, 'priority_support' => true]],
        ];

        foreach ($plans as $plan) {
            Plan::firstOrCreate(['code' => $plan['code']], $plan);
        }

        foreach (['ai-agent', 'customer-portal', 'payouts'] as $key) {
            FeatureFlag::firstOrCreate(['key' => $key], ['enabled' => false]);
        }

        $this->call(DemoTenantSeeder::class);
    }
}
