<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Tenant Administrator roles were provisioned without any IAM permission,
 * so tenant admins could not invite or create users. Grant the
 * tenant-scoped set to every existing Tenant Administrator role; new
 * tenants get it from TenantCreatedHandler.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'iam.users.read' => 'List and view users',
        'iam.users.manage' => 'Create, update, disable users and assign roles',
        'iam.roles.read' => 'List and view roles and the permission catalog',
    ];

    public function up(): void
    {
        $now = now();
        foreach (self::PERMISSIONS as $name => $description) {
            if (! DB::table('permissions')->where('name', $name)->exists()) {
                DB::table('permissions')->insert([
                    'id' => (string) \Illuminate\Support\Str::uuid7(),
                    'name' => $name, 'description' => $description,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
        $permissions = DB::table('permissions')->whereIn('name', array_keys(self::PERMISSIONS))->pluck('id');
        $roles = DB::table('roles')->where('name', 'Tenant Administrator')->pluck('id');
        foreach ($roles as $role) {
            foreach ($permissions as $permission) {
                DB::table('permission_role')->insertOrIgnore(['role_id' => $role, 'permission_id' => $permission]);
            }
        }
    }

    public function down(): void
    {
        $permissions = DB::table('permissions')->whereIn('name', array_keys(self::PERMISSIONS))->pluck('id');
        $roles = DB::table('roles')->where('name', 'Tenant Administrator')->pluck('id');
        DB::table('permission_role')->whereIn('role_id', $roles)->whereIn('permission_id', $permissions)->delete();
    }
};
