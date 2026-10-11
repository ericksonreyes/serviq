<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tenant subscriptions — which plan a tenant is billed on and the
        // operational state of that billing relationship. One row per
        // tenant; the tenant's plan_id mirrors it for read convenience.
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->unique();
            $table->uuid('plan_id');
            $table->string('status')->default('active');   // active | past_due | canceled
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreign('plan_id')->references('id')->on('plans')->restrictOnDelete();
            $table->index('status');
        });

        // Platform-wide configuration — a single JSON document of settings
        // and policies owned by Platform Administrators. One row only.
        Schema::create('platform_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->jsonb('settings');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_settings');
        Schema::dropIfExists('subscriptions');
    }
};
