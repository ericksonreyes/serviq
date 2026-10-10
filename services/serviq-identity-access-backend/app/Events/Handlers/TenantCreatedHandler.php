<?php

namespace App\Events\Handlers;

use App\Models\TenantScope;
use Illuminate\Support\Facades\Log;

/**
 * Platform.TenantCreated → register the tenant scope so Platform
 * Management (or an admin) can bind users and roles to the tenant_id.
 * IAM never owns tenant business data — this is provisioning only.
 */
class TenantCreatedHandler
{
    public function handle(array $envelope): void
    {
        $tenantId = $envelope['payload']['tenant_id'] ?? $envelope['tenant_id'] ?? null;
        if ($tenantId === null) {
            throw new \RuntimeException('Platform.TenantCreated missing tenant_id');
        }

        TenantScope::firstOrCreate(
            ['id' => $tenantId],
            ['name' => $envelope['payload']['name'] ?? null],
        );

        Log::info("Tenant scope registered: {$tenantId}");
    }
}
