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

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'permission_role');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'role_user');
    }
}
