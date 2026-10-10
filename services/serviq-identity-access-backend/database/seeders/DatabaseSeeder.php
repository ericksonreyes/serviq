<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Phase-1 bootstrap: the IAM permission catalog, the platform scope's
 * canonical roles, and the first Platform Administrator (provisioning is
 * not self-serve yet — BUILD_SEQUENCE.MD).
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        foreach (Permission::CATALOG as $name => $description) {
            Permission::firstOrCreate(['name' => $name], ['description' => $description]);
        }

        $platformAdmin = Role::firstOrCreate(
            ['scope' => User::SCOPE_PLATFORM, 'name' => Role::PLATFORM_ADMINISTRATOR],
            ['description' => 'Platform-level administrator — full IAM and platform access'],
        );
        $platformAdmin->permissions()->sync(Permission::pluck('id'));

        // Canonical role names exist per scope; tenant scopes create their
        // own when tenants are provisioned. Platform only needs the admin.
        $admin = User::firstOrCreate(
            ['scope' => User::SCOPE_PLATFORM, 'username' => config('iam.seed.admin_username')],
            [
                'password' => config('iam.seed.admin_password'),
                'display_name' => 'Platform Administrator',
            ],
        );
        $admin->roles()->syncWithoutDetaching([$platformAdmin->id]);
    }
}
