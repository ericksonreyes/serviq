<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ADR-0027 hardening — the accounts a tenant actually receives money
        // at (company wallet, bank account, remittance-center payout name).
        // Transfer-receipt parsing extracts the recipient; billing flags
        // recipient_mismatch when it doesn't match a configured account.
        Schema::create('company_accounts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('channel'); // wallet | bank | remittance_center
            $table->string('label');   // "GCash — ServIQ Acme", "BDO current"
            $table->string('account_no')->nullable(); // wallet no / account no / claimant name
            $table->timestamps();
            $table->index(['tenant_id', 'channel']);
        });

        // The uploader may correct the AI-read recipient — tracked separately
        // so a correction still flags claimed_mismatch.
        Schema::table('payment_evidence', function (Blueprint $table) {
            $table->string('claimed_recipient')->nullable()->after('claimed_holder');
        });
    }

    public function down(): void
    {
        Schema::table('payment_evidence', function (Blueprint $table) {
            $table->dropColumn('claimed_recipient');
        });
        Schema::dropIfExists('company_accounts');
    }
};
