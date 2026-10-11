<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tenant scopes IAM knows about. The Tenant entity itself is owned by
        // Platform Management; IAM only registers the scope so users and roles
        // can be bound to it (IDENTITY_AND_ACCESS.MD).
        Schema::create('tenant_scopes', function (Blueprint $table) {
            $table->uuid('id')->primary();           // tenant UUIDv7, assigned by Platform Management
            $table->string('name')->nullable();
            $table->timestamps();
        });

        // Users live in a scope: 'platform' or a tenant UUIDv7. Usernames are
        // unique per scope only — (scope, username), never globally unique.
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();           // globally unique user id (UUIDv7) — the `sub` claim
            $table->string('scope');                 // 'platform' or tenant UUIDv7
            $table->string('username');
            $table->string('email')->nullable();
            $table->string('display_name')->nullable();
            $table->string('password');
            $table->string('status')->default('active');   // active | disabled
            $table->rememberToken();
            $table->timestamps();

            $table->unique(['scope', 'username']);
            $table->index('scope');
        });

        // Roles are defined per scope, same as usernames.
        Schema::create('roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('scope');
            $table->string('name');
            $table->string('description')->nullable();
            $table->timestamps();

            $table->unique(['scope', 'name']);
        });

        // Permissions are a global catalog; scopes grant them via roles.
        Schema::create('permissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name')->unique();        // e.g. iam.users.manage
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('role_user', function (Blueprint $table) {
            $table->uuid('role_id');
            $table->uuid('user_id');
            $table->primary(['role_id', 'user_id']);
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('permission_role', function (Blueprint $table) {
            $table->uuid('permission_id');
            $table->uuid('role_id');
            $table->primary(['permission_id', 'role_id']);
            $table->foreign('permission_id')->references('id')->on('permissions')->cascadeOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
        });

        // Outbox rows are written in the same transaction as the state change
        // and relayed to RabbitMQ by `outbox:publish` (EVENT_DELIVERY.MD).
        Schema::create('outbox', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');                  // e.g. Identity.UserRegistered
            $table->jsonb('payload');
            $table->timestamp('occurred_at');
            $table->uuid('tenant_id')->nullable();
            $table->string('actor_service');
            $table->uuid('on_behalf_of')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->index('published_at');
        });

        // Consumer idempotency — dedupe at-least-once deliveries by event id.
        Schema::create('processed_events', function (Blueprint $table) {
            $table->uuid('event_id')->primary();
            $table->timestamp('processed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('processed_events');
        Schema::dropIfExists('outbox');
        Schema::dropIfExists('permission_role');
        Schema::dropIfExists('role_user');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('users');
        Schema::dropIfExists('tenant_scopes');
    }
};
