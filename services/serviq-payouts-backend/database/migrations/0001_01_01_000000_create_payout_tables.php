<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Agent projection — from Assignment.Accepted / Job.* events.
        Schema::create('payout_jobs', function (Blueprint $table) {
            $table->uuid('job_id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('agent_id')->nullable();
            $table->string('job_status')->default('ready_for_assignment');
            $table->timestamps();
        });

        // Agent payout: pending → settled; deductions can make it negative.
        Schema::create('payouts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('job_id')->index();
            $table->uuid('tenant_id')->index();
            $table->uuid('agent_id')->index();
            $table->integer('amount_cents');
            $table->integer('shortfall_cents')->default(0); // ADR-0005 deductions
            $table->integer('applied_cents')->default(0);
            $table->integer('net_cents');
            $table->string('status')->default('pending');  // pending | settled
            $table->string('disbursement_ref')->nullable();
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
        Schema::dropIfExists('payouts');
        Schema::dropIfExists('payout_jobs');
    }
};
