<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Workflow steps per job, projected from Job.Requested. The job is
        // requested long before Assignment.Accepted opens its execution,
        // so the steps are held here and seeded into the execution then.
        Schema::create('job_workflows', function (Blueprint $table) {
            $table->uuid('job_id')->primary();
            $table->uuid('tenant_id')->index();
            $table->jsonb('steps');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_workflows');
    }
};
