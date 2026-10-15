<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (env('SEED_DEMO', true)) {
            $this->call(DemoAgentSeeder::class);
        }
    }
}
