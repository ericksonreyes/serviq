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
        $this->call(DemoCatalogSeeder::class);
    }
}
