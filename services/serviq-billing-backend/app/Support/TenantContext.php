<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Postgres RLS tenant context (ADR-0028). Sets the session GUCs the
 * tenant_isolation policies read: `app.tenant_id` for request scope or
 * `app.is_system` for trusted console/system processes (outbox relay,
 * consumers, seeders, migrations). Application-level `where(tenant_id)`
 * stays the contract — this is the fail-closed net underneath it for a
 * query that forgets. No-op on sqlite so feature tests are unaffected.
 */
class TenantContext
{
    public static function supported(): bool
    {
        return DB::connection()->getDriverName() === 'pgsql';
    }

    /** Pin this connection to one tenant — every subsequent row op is
     *  filtered by policy whether or not the query scopes itself. */
    public static function asTenant(string $tenantId): void
    {
        if (self::supported()) {
            DB::statement('SELECT set_config(?, ?, false)', ['app.tenant_id', $tenantId]);
        }
    }

    /** Console/system processes legitimately cross tenants. Callers hold
     *  the DB credentials anyway — RLS gates the HTTP surface, not CLI. */
    public static function asSystem(): void
    {
        if (self::supported()) {
            DB::statement("SELECT set_config('app.is_system', 'on', false)");
        }
    }
}
