<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Subscription plans — what a tenant is signed up for.
        Schema::create('plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('description')->nullable();
            $table->unsignedInteger('price_cents')->default(0);
            $table->string('currency', 3)->default('PHP');
            $table->jsonb('features')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        // The Tenant entity — Platform Management is its system of record
        // (ADR-0002). IAM receives it only as an authorization scope.
        Schema::create('tenants', function (Blueprint $table) {
            $table->uuid('id')->primary();           // tenant UUIDv7 — this is the JWT tenant_id
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('status')->default('pending');   // pending | active | suspended | deactivated
            $table->uuid('plan_id')->nullable();
            $table->timestamps();

            $table->foreign('plan_id')->references('id')->on('plans')->nullOnDelete();
            $table->index('status');
        });

        // Platform-wide feature flags.
        Schema::create('feature_flags', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('key')->unique();
            $table->boolean('enabled')->default(false);
            $table->string('description')->nullable();
            $table->timestamps();
        });

        // Outbox — same-transaction event recording, relayed to RabbitMQ by
        // `outbox:publish` (EVENT_DELIVERY.MD).
        Schema::create('outbox', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->jsonb('payload');
            $table->timestamp('occurred_at');
            $table->uuid('tenant_id')->nullable();
            $table->string('actor_service');
            $table->uuid('on_behalf_of')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->index('published_at');
        });

        Schema::create('processed_events', function (Blueprint $table) {
            $table->uuid('event_id')->primary();
            $table->timestamp('processed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('processed_events');
        Schema::dropIfExists('outbox');
        Schema::dropIfExists('feature_flags');
        Schema::dropIfExists('tenants');
        Schema::dropIfExists('plans');
    }
};
