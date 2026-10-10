<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The tenant's service catalog — what can be requested.
        Schema::create('services', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('name');
            $table->string('description')->nullable();
            $table->unsignedInteger('price_cents')->default(0);
            $table->string('currency', 3)->default('PHP');
            $table->unsignedInteger('estimated_minutes')->nullable();
            $table->jsonb('required_skills')->nullable();
            $table->jsonb('service_areas')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'name']);
        });

        // Ordered workflow template steps — copied into a job's workflow
        // instance when a job is created for the service.
        Schema::create('workflow_steps', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('service_id')->index();
            $table->unsignedInteger('position');
            $table->string('name');
            $table->jsonb('required_evidence')->nullable(); // photo|signature|notes
            $table->timestamps();

            $table->foreign('service_id')->references('id')->on('services')->cascadeOnDelete();
            $table->unique(['service_id', 'position']);
        });

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
        Schema::dropIfExists('workflow_steps');
        Schema::dropIfExists('services');
    }
};
