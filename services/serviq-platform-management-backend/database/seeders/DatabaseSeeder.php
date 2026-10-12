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
                'features' => ['max_agents' => 100, 'max_services' => 200]],
        ];

        foreach ($plans as $plan) {
            Plan::firstOrCreate(['code' => $plan['code']], $plan);
        }

        // All three features are live, so every flag seeds enabled — they
        // are runtime kill-switches, not launch gates.
        $flags = [
            'ai-agent' => ['enabled' => true, 'description' => 'AI assistant chat and receipt/document parsing'],
            'customer-portal' => ['enabled' => true, 'description' => 'Customer portal availability (kill-switch)'],
            'payouts' => ['enabled' => true, 'description' => 'Payout and remittance flows'],
        ];
        foreach ($flags as $key => $attrs) {
            FeatureFlag::firstOrCreate(['key' => $key], $attrs);
        }

        $this->call(DemoTenantSeeder::class);
    }
}
