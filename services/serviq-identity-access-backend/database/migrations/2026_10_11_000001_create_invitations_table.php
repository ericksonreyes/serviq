<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Email invitations — staff invite customers/agents; the invitee
        // accepts through the portal signup page. Token is stored hashed.
        Schema::create('invitations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('scope')->index();              // tenant scope id
            $table->string('email')->index();
            $table->string('role');
            $table->string('token_hash', 64)->unique();
            $table->uuid('invited_by')->nullable();
            $table->string('status')->default('pending'); // pending | accepted | revoked
            $table->timestamp('expires_at');
            $table->uuid('accepted_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
    }
};
