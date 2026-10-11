<?php

namespace App\Events\Handlers;

use App\Models\Role;
use App\Models\TenantScope;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Platform.TenantCreated → register the tenant scope so Platform
 * Management (or an admin) can bind users and roles to the tenant_id.
 * When the event carries `initial_users` (tenant self-signup, demo
 * seeding), each account is provisioned here — provider onboarding is
 * per SERVICE_PROVIDER.MD. IAM never owns tenant business data —
 * this is provisioning only.
 */
class TenantCreatedHandler
{
    public function handle(array $envelope): void
    {
        $tenantId = $envelope['payload']['tenant_id'] ?? $envelope['tenant_id'] ?? null;
        if ($tenantId === null) {
            throw new \RuntimeException('Platform.TenantCreated missing tenant_id');
        }

        // updateOrCreate so replay heals scopes provisioned before slug
        // projection existed (slug-null rows block tenant-slug logins).
        TenantScope::updateOrCreate(
            ['id' => $tenantId],
            [
                'name' => $envelope['payload']['name'] ?? null,
                'slug' => $envelope['payload']['slug'] ?? null,
            ],
        );

        foreach ($envelope['payload']['initial_users'] ?? [] as $user) {
            $this->provisionUser($tenantId, $user);
        }

        Log::info("Tenant scope registered: {$tenantId}");
    }

    private function provisionUser(string $tenantId, array $data): void
    {
        // Password arrives pre-hashed from the publisher — the outbox row
        // never holds plaintext credentials.
        $user = User::firstOrCreate(
            ['scope' => $tenantId, 'username' => $data['username']],
            [
                'email' => $data['email'] ?? null,
                'display_name' => $data['display_name'] ?? null,
                'password' => $data['password'],
            ],
        );

        $role = Role::firstOrCreate(
            ['scope' => $tenantId, 'name' => $data['role'] ?? Role::CUSTOMER],
            ['description' => 'Provisioned at tenant creation'],
        );
        $user->roles()->syncWithoutDetaching([$role->id]);
    }
}
