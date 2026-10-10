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

    public const CATALOG = [
        self::USERS_READ => 'List and view users',
        self::USERS_MANAGE => 'Create, update, disable users and assign roles',
        self::ROLES_READ => 'List and view roles and the permission catalog',
        self::ROLES_MANAGE => 'Create roles and grant permissions',
        self::TENANTS_READ => 'List registered tenant scopes',
        self::TENANTS_MANAGE => 'Register tenant scopes for provisioning',
    ];

    protected $fillable = ['name', 'description'];

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'permission_role');
    }
}
