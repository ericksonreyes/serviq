<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Postgres row-level security — the fail-closed net under application-level
 * tenant scoping (ADR-0028). A query that forgets `where(tenant_id)` returns
 * nothing instead of leaking; writes can't produce cross-tenant rows.
 *
 * Policy shape (permissive, OR'd — a lone RESTRICTIVE policy would deny
 * all rows since restrictive policies only narrow permissive grants):
 *   visible iff  app.is_system = 'on'            — console/system bypass
 *             OR tenant_id = app.tenant_id        — pinned per request
 * Unset GUCs read NULL → matches nothing → zero rows. `FORCE` makes the
 * policy bind the table owner too (the `serviq` role owns its tables).
 *
 * Child tables without their own tenant_id (`invoice_events`,
 * `remittance_items`) gate on the parent's tenant via EXISTS.
 * `processed_events` is deliberately untouched: it's a global dedupe ledger
 * with no tenant column — nothing to isolate.
 */
return new class extends Migration
{
    private const SCOPED = [
        'invoices', 'payments', 'remittances', 'outbox',
        'payment_evidence', 'refund_requests', 'company_accounts',
    ];

    // child table => parent join the EXISTS subquery checks
    private const VIA_PARENT = [
        'invoice_events' => "EXISTS (SELECT 1 FROM invoices p WHERE p.id = invoice_events.invoice_id AND p.tenant_id = current_setting('app.tenant_id', true)::uuid)",
        'remittance_items' => "EXISTS (SELECT 1 FROM remittances p WHERE p.id = remittance_items.remittance_id AND p.tenant_id = current_setting('app.tenant_id', true)::uuid)",
    ];

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return; // sqlite test runs — no RLS support
        }

        $scope = "current_setting('app.is_system', true) = 'on'"
               . " OR tenant_id = current_setting('app.tenant_id', true)::uuid";

        foreach (self::SCOPED as $table) {
            DB::statement("ALTER TABLE {$table} ENABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$table} FORCE ROW LEVEL SECURITY");
            DB::statement("CREATE POLICY tenant_isolation ON {$table} USING ({$scope}) WITH CHECK ({$scope})");
        }

        foreach (self::VIA_PARENT as $table => $exists) {
            $via = "current_setting('app.is_system', true) = 'on' OR {$exists}";
            DB::statement("ALTER TABLE {$table} ENABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$table} FORCE ROW LEVEL SECURITY");
            DB::statement("CREATE POLICY via_parent ON {$table} USING ({$via}) WITH CHECK ({$via})");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        foreach (self::SCOPED as $table) {
            DB::statement("DROP POLICY IF EXISTS tenant_isolation ON {$table}");
            DB::statement("ALTER TABLE {$table} NO FORCE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$table} DISABLE ROW LEVEL SECURITY");
        }
        foreach (array_keys(self::VIA_PARENT) as $table) {
            DB::statement("DROP POLICY IF EXISTS via_parent ON {$table}");
            DB::statement("ALTER TABLE {$table} NO FORCE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$table} DISABLE ROW LEVEL SECURITY");
        }
    }
};
