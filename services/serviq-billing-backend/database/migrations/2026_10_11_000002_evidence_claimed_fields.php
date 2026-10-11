<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The uploader's claimed values sit beside the AI-parsed ones —
        // a mismatch is the fraud/manual-review signal.
        Schema::table('payment_evidence', function (Blueprint $table) {
            $table->string('claimed_reference')->nullable()->after('extracted');
            $table->integer('claimed_amount_cents')->nullable()->after('claimed_reference');
        });
    }

    public function down(): void
    {
        Schema::table('payment_evidence', function (Blueprint $table) {
            $table->dropColumn(['claimed_reference', 'claimed_amount_cents']);
        });
    }
};
