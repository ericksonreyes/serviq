<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Tenant catalogs are normally created through the API once a tenant
 * exists (Platform Management owns tenants). DemoTenantSeeder's fixed
 * tenant ID lets the demo catalog be seeded without a lookup — see
 * root README's Local seed accounts section.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(LocationsSeeder::class);

        // Demo catalog skipped under SEED_DEMO=false (e2e world is built
        // through the tenant console, not seeded).
        if (env('SEED_DEMO', true)) {
            $this->call(DemoCatalogSeeder::class);
            $this->call(DemoRepairGuideSeeder::class);
        }
    }
}
