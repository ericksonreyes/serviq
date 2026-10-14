<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ADR-0026 — holder tracks where money sits, not how it was paid:
        // cash is always agent-held; digital payments may land in the
        // agent's own wallet (still owes remittance) or the company
        // account (already settled via the `digital` remittance kind).
        Schema::table('payments', function (Blueprint $table) {
            $table->string('holder')->default('agent')->after('method'); // agent | company
        });
        DB::table('payments')->where('method', '!=', 'cash')->update(['holder' => 'company']);

        // Turn-ins gain a channel: cash hand-over vs e-wallet transfer.
        Schema::table('remittances', function (Blueprint $table) {
            $table->string('channel')->nullable()->after('kind'); // cash | wallet (turn_ins only)
        });
        DB::table('remittances')->where('kind', 'turn_in')->update(['channel' => 'cash']);

        // The uploader declares where digital payment funds landed —
        // extracted fields come from the AI parse; this is asserted knowledge.
        Schema::table('payment_evidence', function (Blueprint $table) {
            $table->string('claimed_holder')->nullable()->after('claimed_amount_cents'); // agent | company
        });
    }

    public function down(): void
    {
        Schema::table('payment_evidence', function (Blueprint $table) {
            $table->dropColumn('claimed_holder');
        });
        Schema::table('remittances', function (Blueprint $table) {
            $table->dropColumn('channel');
        });
        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn('holder');
        });
    }
};
