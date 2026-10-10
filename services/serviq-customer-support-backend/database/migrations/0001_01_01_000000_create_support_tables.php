<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cases', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('job_id')->nullable()->index();
            $table->uuid('invoice_id')->nullable();
            $table->uuid('customer_id')->nullable();
            $table->string('subject');
            $table->string('status')->default('open');   // open | investigating | decided | closed
            $table->jsonb('details')->nullable();
            $table->timestamps();
        });

        // Refund decision — ADR-0004: Support DECIDES, Billing EXECUTES.
        Schema::create('refund_decisions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('case_id')->index();
            $table->uuid('invoice_id')->index();
            $table->uuid('tenant_id');
            $table->integer('amount_cents')->nullable();   // null = full
            $table->string('decision');                    // approved | denied
            $table->string('reason')->nullable();
            $table->uuid('decided_by')->nullable();
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
        Schema::dropIfExists('refund_decisions');
        Schema::dropIfExists('cases');
    }
};
