<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Booked appointment time — set from the request's schedule choice at
        // Job.Requested, moved by Job.Rescheduled while unassigned/unstarted.
        Schema::table('jobs', function (Blueprint $table) {
            $table->timestamp('scheduled_for')->nullable()->after('assigned_agent_id');
        });
    }

    public function down(): void
    {
        Schema::table('jobs', function (Blueprint $table) {
            $table->dropColumn('scheduled_for');
        });
    }
};
