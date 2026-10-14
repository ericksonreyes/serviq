<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Set once the customer has been told "we now cover you" — the
        // interest is fulfilled. Unmet rows are both the demand signal and
        // the notify-on-expansion candidate set (CoverageExpansionHandler).
        Schema::table('coverage_interest', function (Blueprint $table) {
            $table->timestamp('notified_at')->nullable()->index()->after('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('coverage_interest', function (Blueprint $table) {
            $table->dropColumn('notified_at');
        });
    }
};
