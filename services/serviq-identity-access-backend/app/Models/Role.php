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
    public const TENANT_ADMINISTRATOR_PERMISSIONS = [
        Permission::USERS_READ,
        Permission::USERS_MANAGE,
        Permission::ROLES_READ,
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
