<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Deduction-only payout rows (remittance shortfalls) aren't tied
        // to a job — the clawback ledger reads them via agent_id.
        Schema::table('payouts', function (Blueprint $table) {
            $table->uuid('job_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('payouts', function (Blueprint $table) {
            $table->uuid('job_id')->nullable(false)->change();
        });
    }
};
