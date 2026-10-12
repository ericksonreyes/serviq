<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Projection of the tenant's subscribed plan — rebuilt from
        // Platform.TenantCreated/SubscriptionAssigned events so plan
        // limits (max_agents …) can be enforced here without a
        // cross-context read of platform-management.
        Schema::create('projected_plan_features', function (Blueprint $table) {
            $table->uuid('tenant_id')->primary();
            $table->string('plan_code')->nullable();
            $table->string('status')->default('active'); // subscription status
            $table->jsonb('features')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('projected_plan_features');
    }
};
