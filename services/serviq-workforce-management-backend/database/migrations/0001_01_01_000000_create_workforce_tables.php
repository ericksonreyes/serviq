<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('user_id')->nullable();          // IAM user, when linked
            $table->string('name');
            $table->jsonb('skills')->nullable();          // ["refrigeration", "ac-repair"]
            $table->jsonb('certifications')->nullable();
            $table->jsonb('service_areas')->nullable();   // ["Antipolo", "Cainta"]
            $table->unsignedSmallInteger('capacity')->default(5); // concurrent jobs
            $table->string('status')->default('active');  // active | inactive
            $table->timestamps();
        });

        // Weekly availability roster.
        Schema::create('agent_availability', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('agent_id')->index();
            $table->unsignedTinyInteger('day_of_week');   // 0=Sunday … 6=Saturday
            $table->time('start_time');
            $table->time('end_time');
            $table->timestamps();

            $table->foreign('agent_id')->references('id')->on('agents')->cascadeOnDelete();
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
        Schema::dropIfExists('agent_availability');
        Schema::dropIfExists('agents');
    }
};
