<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Event-sourced job stream — every state change is an appended event.
        Schema::create('job_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('job_id')->index();
            $table->unsignedInteger('seq');            // position in the stream
            $table->string('type');                    // Job.Requested, Job.WorkflowStepCompleted, …
            $table->jsonb('payload');
            $table->timestamp('occurred_at');
            $table->unique(['job_id', 'seq']);
        });

        // Current-state projection rebuilt by replaying job_events.
        Schema::create('jobs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('request_id')->nullable();
            $table->uuid('service_id')->nullable();
            $table->uuid('customer_id')->nullable();
            $table->uuid('assigned_agent_id')->nullable();
            $table->string('status')->default('requested');
            $table->jsonb('workflow_instance')->nullable(); // step snapshot
            $table->unsignedInteger('version')->default(0); // = event count
            $table->timestamps();
            $table->index('status');
        });

        // Local projection of Service Management's catalog — event-carried
        // state transfer, never a cross-service read.
        Schema::create('service_templates', function (Blueprint $table) {
            $table->uuid('service_id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('name');
            $table->jsonb('steps'); // [{name, position, required_evidence}]
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
        Schema::dropIfExists('service_templates');
        Schema::dropIfExists('jobs');
        Schema::dropIfExists('job_events');
    }
};
