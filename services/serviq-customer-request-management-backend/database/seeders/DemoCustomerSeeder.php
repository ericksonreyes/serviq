<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

/**
 * Demo customer record for the "Acme Services" tenant
 * (root README's Local seed accounts section). DEMO_TENANT_ID matches DemoTenantSeeder's
 * fixed UUID in platform-management. This is the CRM-side customer row
 * that service_requests reference — the IAM jane.customer account is
 * separate identity, provisioned by the tenant event.
 */
class DemoCustomerSeeder extends Seeder
{
    public const DEMO_TENANT_ID = '01ac0000-0000-7000-8000-00000000acde';

    public function run(): void
    {
        Customer::firstOrCreate(
            ['tenant_id' => self::DEMO_TENANT_ID, 'name' => 'Jane Customer'],
            [
                'contact' => ['email' => 'customer@acme.test', 'phone' => '+639170000001'],
                'address' => ['line1' => '123 Demo Street', 'barangay' => 'Dela Paz', 'city' => 'Antipolo'],
            ],
        );
    }
}
