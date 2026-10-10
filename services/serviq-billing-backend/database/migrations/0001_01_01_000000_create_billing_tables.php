<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Event-sourced invoice — invoice_events is the source of truth,
        // invoices is the folded projection (same pattern as serviq_jobs).
        Schema::create('invoice_events', function (Blueprint $table) {
            $table->id();
            $table->uuid('invoice_id')->index();
            $table->unsignedInteger('seq');
            $table->string('type');
            $table->jsonb('payload');
            $table->timestamps();
            $table->unique(['invoice_id', 'seq']);
        });

        Schema::create('invoices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('job_id')->index();
            $table->uuid('tenant_id')->index();
            $table->uuid('customer_id')->nullable();
            $table->string('status')->default('issued');   // issued | paid | remitted | refunded
            $table->integer('amount_cents');
            $table->string('currency')->default('PHP');
            $table->integer('version')->default(0);
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('invoice_id')->index();
            $table->uuid('tenant_id')->index();
            $table->integer('amount_cents');
            $table->string('method');          // cash | card | wallet | bank
            $table->string('reference')->nullable();  // payment evidence ref
            $table->string('recorded_by')->nullable();
            $table->timestamps();
        });

        // Remittance — invoices settled to the tenant's organization.
        Schema::create('remittances', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('status')->default('open');   // open | settled
            $table->integer('total_cents')->default(0);
            $table->timestamps();
        });
        Schema::create('remittance_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('remittance_id')->index();
            $table->uuid('invoice_id')->index();
            $table->integer('amount_cents');
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
        Schema::dropIfExists('remittance_items');
        Schema::dropIfExists('remittances');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('invoice_events');
    }
};
