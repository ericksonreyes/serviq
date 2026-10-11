<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Refund requests — intake is a pending request, Customer Support's
        // decision (Support.RefundDecided) approves it, the permission-gated
        // execute endpoint performs the refund (Invoice.Refunded).
        Schema::create('refund_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('invoice_id')->index();
            $table->string('status')->default('pending');  // pending | approved | executed | rejected
            $table->text('reason')->nullable();
            $table->uuid('requested_by')->nullable();
            $table->uuid('decision_id')->nullable();       // Support refund_decisions.id
            $table->uuid('approved_by')->nullable();
            $table->uuid('executed_by')->nullable();
            $table->timestamp('executed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('refund_requests');
    }
};
