<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Projection of Workforce agent schedules — rebuilt from
        // Workforce.AgentRegistered/AgentUpdated events so service
        // availability can factor real crew capacity without a
        // cross-context read.
        Schema::create('projected_agent_availability', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('agent_id')->index();
            $table->unsignedTinyInteger('day_of_week'); // 0 = Sunday
            $table->string('start_time', 5);            // HH:MM
            $table->string('end_time', 5);
            $table->string('status')->default('active');
            $table->unsignedSmallInteger('capacity')->default(1); // concurrent jobs
            $table->timestamps();

            $table->index(['tenant_id', 'day_of_week']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('projected_agent_availability');
    }
};
