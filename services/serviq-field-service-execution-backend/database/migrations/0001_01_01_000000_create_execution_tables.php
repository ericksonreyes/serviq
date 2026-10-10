<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Jobs this context is executing — projected from Assignment.Accepted.
        Schema::create('executions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('job_id')->index();
            $table->uuid('tenant_id')->index();
            $table->uuid('agent_id')->index();
            $table->uuid('assignment_id')->nullable();
            $table->string('status')->default('assigned');  // assigned | checked_in | in_progress | completed
            $table->timestamp('checked_in_at')->nullable();
            $table->jsonb('workflow_instance')->nullable();  // step snapshot from Job.* events
            $table->timestamps();
        });

        // Evidence: photos, signatures, notes, parts — files land in MinIO;
        // this is the structured record.
        Schema::create('evidence', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('execution_id')->index();
            $table->uuid('tenant_id')->index();
            $table->unsignedInteger('step_position')->nullable();
            $table->string('kind');                 // photo | signature | note | part
            $table->string('object_ref')->nullable(); // bucket/key in MinIO
            $table->string('content_type')->nullable();
            $table->jsonb('data')->nullable();        // note text, part details
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
        Schema::dropIfExists('evidence');
        Schema::dropIfExists('executions');
    }
};
