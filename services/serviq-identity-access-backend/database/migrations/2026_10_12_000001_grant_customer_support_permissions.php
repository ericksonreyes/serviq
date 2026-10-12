<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Customer Support had no canonical permission bundle, so support staff
 * could read customer records but not maintain or invite them. Grant
 * requests.manage + iam.invitations.manage to every existing Customer
 * Support role; new tenants get it from TenantCreatedHandler.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'requests.manage' => 'Manage customer profiles and service requests',
        'iam.invitations.manage' => 'Invite customers and agents into a tenant scope',
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
        $roles = DB::table('roles')->where('name', 'Customer Support')->pluck('id');
        foreach ($roles as $role) {
            foreach ($permissions as $permission) {
                DB::table('permission_role')->insertOrIgnore(['role_id' => $role, 'permission_id' => $permission]);
            }
        }
    }

    public function down(): void
    {
        $permissions = DB::table('permissions')->whereIn('name', array_keys(self::PERMISSIONS))->pluck('id');
        $roles = DB::table('roles')->where('name', 'Customer Support')->pluck('id');
        DB::table('permission_role')->whereIn('role_id', $roles)->whereIn('permission_id', $permissions)->delete();
    }
};
