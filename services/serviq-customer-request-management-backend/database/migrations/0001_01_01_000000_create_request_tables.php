<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('name');
            $table->jsonb('contact')->nullable();      // phone, email
            $table->jsonb('address')->nullable();      // line1, barangay, city, lat/lng
            $table->timestamps();
        });

        // The customer's intent — may reference a catalog service but stores
        // its own details; a request eventually produces a Service Job.
        Schema::create('service_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('customer_id')->index();
            $table->uuid('service_id')->nullable();
            $table->string('status')->default('submitted'); // submitted | reviewed | converted | cancelled
            $table->jsonb('details')->nullable();           // address, preferred_schedule, notes, attachments
            $table->timestamps();

            $table->foreign('customer_id')->references('id')->on('customers')->restrictOnDelete();
            $table->index('status');
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
        Schema::dropIfExists('service_requests');
        Schema::dropIfExists('customers');
    }
};
