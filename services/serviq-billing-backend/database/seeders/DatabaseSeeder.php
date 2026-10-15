<?php

namespace Database\Seeders;

use App\Models\CompanyAccount;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    // Demo tenant — matches platform-management's DemoTenantSeeder.
    private const ACME = '01ac0000-0000-7000-8000-00000000acde';

    public function run(): void
    {
        // Entirely demo fixtures — skipped under SEED_DEMO=false (e2e
        // seeds these through the bootstrap suite instead).
        if (! env('SEED_DEMO', true)) {
            return;
        }

        // Receiving accounts the recipient check (ADR-0027) matches transfer
        // receipts against — demo data so the guardrail is exercised locally.
        foreach ([
            ['channel' => 'wallet', 'label' => 'GCash — ServIQ Acme', 'account_no' => '09171234567'],
            ['channel' => 'bank', 'label' => 'BDO — ServIQ Acme', 'account_no' => '001234567890'],
        ] as $row) {
            CompanyAccount::firstOrCreate(
                ['tenant_id' => self::ACME] + $row
            );
        }
    }
}
