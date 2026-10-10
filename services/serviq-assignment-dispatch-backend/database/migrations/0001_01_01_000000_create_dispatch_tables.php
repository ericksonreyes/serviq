<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Workforce projection — event-carried state transfer.
        Schema::create('agents', function (Blueprint $table) {
            $table->uuid('agent_id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('name');
            $table->jsonb('skills')->nullable();
            $table->jsonb('service_areas')->nullable();
            $table->unsignedSmallInteger('capacity')->default(5);
            $table->string('status')->default('active');
            $table->timestamps();
        });

        // Job projection — dispatch acts on jobs that are ready.
        Schema::create('dispatchable_jobs', function (Blueprint $table) {
            $table->uuid('job_id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('service_id')->nullable();
            $table->string('status')->default('ready_for_assignment');
            $table->timestamps();
        });

        // Offers and accepted assignments share one table — an offer is an
        // assignment in `offered` status (broadcast/self-assign); dispatcher
        // and automatic create `accepted` directly.
        Schema::create('assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('job_id')->index();
            $table->uuid('tenant_id')->index();
            $table->uuid('agent_id')->index();
            $table->string('strategy');   // dispatcher | automatic | broadcast | self
            $table->string('status');     // offered | accepted | rejected | revoked | expired
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        // Only one accepted assignment per job — the race guard.
        DB::statement('CREATE UNIQUE INDEX assignments_one_accepted ON assignments (job_id) WHERE status = \'accepted\'');

        // Tenant dispatch configuration + fallback chain.
        Schema::create('assignment_rules', function (Blueprint $table) {
            $table->uuid('tenant_id')->primary();
            $table->string('strategy')->default('automatic');
            $table->unsignedInteger('offer_ttl_seconds')->default(60);
            $table->jsonb('fallback')->nullable();   // e.g. ["broadcast","dispatcher"]
            $table->timestamps();
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
        Schema::dropIfExists('assignment_rules');
        Schema::dropIfExists('assignments');
        Schema::dropIfExists('dispatchable_jobs');
        Schema::dropIfExists('agents');
    }
};
