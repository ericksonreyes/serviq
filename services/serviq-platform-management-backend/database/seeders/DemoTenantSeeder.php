<?php

namespace Database\Seeders;

use App\Domain\Tenancy\TenantLifecycle;
use App\Models\Tenant;
use App\Services\DomainEventRecorder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Demo service provider for local testing (root README's Local seed accounts section).
 * Runs inside `db:seed` on container start — idempotent via slug, and the
 * event only fires on first creation. Emits the real Platform.TenantCreated
 * with `initial_users` so IAM provisions the scope and demo accounts
 * through the normal pipeline — no cross-service database writes here.
 *
 * The tenant ID is a FIXED UUID so the other services' demo seeders can
 * write tenant-scoped rows (catalog, agents, customers) without knowing a
 * per-install generated ID — the constant is repeated in each Demo*Seeder
 * and documented in root README's Local seed accounts section.
 */
class DemoTenantSeeder extends Seeder
{
    public const DEMO_TENANT_ID = '01ac0000-0000-7000-8000-00000000acde';

    private const DEMO_PASSWORD = 'demo-pass-123';

    private const DEMO_USERS = [
        ['username' => 'acme.admin', 'email' => 'admin@acme.test', 'display_name' => 'Acme Admin', 'role' => 'Tenant Administrator'],
        ['username' => 'anna.agent', 'email' => 'agent@acme.test', 'display_name' => 'Anna Agent', 'role' => 'Service Agent'],
        ['username' => 'jane.customer', 'email' => 'customer@acme.test', 'display_name' => 'Jane Customer', 'role' => 'Customer'],
    ];

    public function run(): void
    {
        $events = app(DomainEventRecorder::class);

        $tenant = DB::transaction(function () use ($events) {
            $tenant = Tenant::where('slug', 'acme')->first();
            if ($tenant === null) {
                // id is not fillable — set it directly so HasUuid7 keeps it.
                $tenant = new Tenant([
                    'name' => 'Acme Services',
                    'slug' => 'acme',
                    'status' => TenantLifecycle::PENDING,
                ]);
                $tenant->id = self::DEMO_TENANT_ID;
                $tenant->save();
            }

            // Public directory blurb — backfill so older local installs get it too.
            if ($tenant->description === null) {
                $tenant->description = 'Appliance repair, installations, and on-demand home services across the metro.';
                $tenant->save();
            }

            // Existing tenant (e.g. created by an earlier session's API call):
            // re-emit TenantCreated — IAM's firstOrCreate scope + firstOrCreate
            // users make replay idempotent, so demo accounts still provision.
            $reemit = ! $tenant->wasRecentlyCreated;

            $events->record('Platform.TenantCreated', [
                'tenant_id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'plan_id' => $tenant->plan_id,
                'plan' => $tenant->plan
                    ? ['code' => $tenant->plan->code, 'features' => $tenant->plan->features]
                    : null,
                // Hashed here — the outbox row never holds plaintext.
                'initial_users' => array_map(
                    fn (array $u) => $u + ['password' => Hash::make(self::DEMO_PASSWORD)],
                    self::DEMO_USERS,
                ),
            ], $tenant->id);

            // Demo tenants start active — real signups stay PENDING for
            // platform review. Skip when the tenant already exists in some
            // state (transition rules still apply — an ILLEGAL transition
            // would throw).
            if (! $reemit) {
                $tenant->transitionTo(TenantLifecycle::ACTIVE);
                $events->record('Platform.TenantActivated', ['tenant_id' => $tenant->id], $tenant->id);
            }

            return $tenant;
        });
    }
}
