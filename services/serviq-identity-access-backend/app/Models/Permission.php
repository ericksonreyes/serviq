<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Permission extends Model
{
    use HasUuid7;

    // IAM's own permission catalog. Other contexts define their own
    // (<context>.<resource>.<action>) and verify them from JWT claims.
    public const USERS_READ = 'iam.users.read';

    public const USERS_MANAGE = 'iam.users.manage';

    public const ROLES_READ = 'iam.roles.read';

    public const ROLES_MANAGE = 'iam.roles.manage';

    public const TENANTS_READ = 'iam.tenants.read';

    public const TENANTS_MANAGE = 'iam.tenants.manage';

    public const PLATFORM_ADMIN = 'platform.admin';

    public const WORKFORCE_AGENTS_MANAGE = 'workforce.agents.manage';

    public const CATALOG_SERVICES_MANAGE = 'catalog.services.manage';

    public const DISPATCH_ASSIGNMENTS_MANAGE = 'dispatch.assignments.manage';

    public const JOBS_EXECUTE = 'jobs.execute';

    public const REQUESTS_MANAGE = 'requests.manage';

    public const BILLING_PAYMENTS_RECORD = 'billing.payments.record';

    public const BILLING_REMIT = 'billing.remit';

    public const NOTIFY_TEMPLATES_MANAGE = 'notify.templates.manage';

    public const CATALOG = [
        self::USERS_READ => 'List and view users',
        self::USERS_MANAGE => 'Create, update, disable users and assign roles',
        self::ROLES_READ => 'List and view roles and the permission catalog',
        self::ROLES_MANAGE => 'Create roles and grant permissions',
        self::TENANTS_READ => 'List registered tenant scopes',
        self::TENANTS_MANAGE => 'Register tenant scopes for provisioning',
        self::PLATFORM_ADMIN => 'Operate the platform: tenants, plans, flags, settings',
        self::WORKFORCE_AGENTS_MANAGE => 'Create and edit field agents',
        self::CATALOG_SERVICES_MANAGE => 'Manage service catalog, pricing, areas, and settings',
        self::DISPATCH_ASSIGNMENTS_MANAGE => 'Configure dispatch and assign jobs to agents',
        self::JOBS_EXECUTE => 'Execute assigned jobs: accept, start, steps, evidence, complete',
        self::REQUESTS_MANAGE => 'Manage customer profiles and service requests',
        self::BILLING_PAYMENTS_RECORD => 'Record payments and submit payment evidence',
        self::BILLING_REMIT => 'Process remittances, refunds, and payouts',
        self::NOTIFY_TEMPLATES_MANAGE => 'Manage notification templates and channels',
    ];

    protected $fillable = ['name', 'description'];

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'permission_role');
    }
}
