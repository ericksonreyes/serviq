<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Demand signal captured when the booking gate rejects a customer —
        // "I'm interested, you just don't cover me yet." Feeds the Areas
        // page demand list and (later) the notify-on-expansion flow.
        // user_id is the caller's IAM sub, never body-supplied.
        Schema::create('coverage_interest', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('admin_code', 10)->index();   // deepest location the customer picked
            $table->uuid('user_id');                      // IAM sub of the interested customer
            $table->timestamps();

            $table->unique(['tenant_id', 'admin_code', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coverage_interest');
    }
};
