<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    use HasUuid7;

    public const PLATFORM_ADMINISTRATOR = 'Platform Administrator';

    public const TENANT_ADMINISTRATOR = 'Tenant Administrator';

    public const DISPATCHER = 'Dispatcher';

    public const CUSTOMER_SUPPORT = 'Customer Support';

    public const SERVICE_AGENT = 'Service Agent';

    public const CUSTOMER = 'Customer';

    /** IAM permissions a Tenant Administrator holds — always tenant-scoped. */
    // Default permission bundles for the canonical role names — synced by
    // the tenant-provisioning handler whenever these roles are (re)created.
    public const DEFAULT_PERMISSIONS = [
        self::TENANT_ADMINISTRATOR => [
            Permission::USERS_READ,
            Permission::USERS_MANAGE,
            Permission::ROLES_READ,
            Permission::WORKFORCE_AGENTS_MANAGE,
            Permission::CATALOG_SERVICES_MANAGE,
            Permission::DISPATCH_ASSIGNMENTS_MANAGE,
            Permission::JOBS_EXECUTE,
            Permission::REQUESTS_MANAGE,
            Permission::BILLING_PAYMENTS_RECORD,
            Permission::BILLING_REMIT,
            Permission::NOTIFY_TEMPLATES_MANAGE,
        ],
        self::DISPATCHER => [
            Permission::DISPATCH_ASSIGNMENTS_MANAGE,
            Permission::REQUESTS_MANAGE,
        ],
        self::CUSTOMER_SUPPORT => [
            Permission::REQUESTS_MANAGE,
            Permission::INVITATIONS_MANAGE,
        ],
        self::SERVICE_AGENT => [
            Permission::JOBS_EXECUTE,
            Permission::BILLING_PAYMENTS_RECORD,
        ],
        self::CUSTOMER => [
            Permission::REQUESTS_MANAGE,
            Permission::BILLING_PAYMENTS_RECORD,
        ],
    ];

    protected $fillable = ['scope', 'name', 'description'];

    // The canonical grant set for a named role. Every provisioning path
    // (tenant-created initial users, self-signup, invite accept) must run
    // this — a firstOrCreate'd role row without it leaves members with a
    // role name and zero permissions.
    public function syncDefaultPermissions(): static
    {
        $names = self::DEFAULT_PERMISSIONS[$this->name] ?? [];
        if ($names !== []) {
            $this->permissions()->syncWithoutDetaching(
                Permission::whereIn('name', $names)->pluck('id')
            );
        }

        return $this;
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'permission_role');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'role_user');
    }
}
