<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * pgvector embedding for semantic repair-guide search (ADR-0013).
     * 768 dims covers the configured providers (nomic-embed-text,
     * gemini text-embedding-004, openai text-embedding-3-small@768).
     * sqlite gets a text column so feature tests exercise the write
     * path; cosine ordering is pgsql-only and verified on the cluster.
     */
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            Schema::table('repair_guides', function (Blueprint $table) {
                $table->text('embedding')->nullable();
            });
            return;
        }
        DB::statement('CREATE EXTENSION IF NOT EXISTS vector');
        DB::statement('ALTER TABLE repair_guides ADD COLUMN embedding vector(768)');
    }

    public function down(): void
    {
        Schema::table('repair_guides', function (Blueprint $table) {
            $table->dropColumn('embedding');
        });
    }
};
