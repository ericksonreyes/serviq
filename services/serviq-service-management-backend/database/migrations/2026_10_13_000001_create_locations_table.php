<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Country-agnostic administrative hierarchy — PSGC is the PH seed
        // (database/data/locations_ph.csv); other deployments seed the same
        // shape from their own national coding system. Codes, not level
        // names, carry the hierarchy so depth may vary per country.
        Schema::create('locations', function (Blueprint $table) {
            $table->string('code', 10)->primary();
            $table->string('name');
            $table->string('level', 20);           // region|province|city|municipality|submunicipality|barangay
            $table->string('parent_code', 10)->nullable()->index();
            $table->string('country', 2)->index();
            $table->timestamps();
        });

        // Trigram matching powers the smart coverage input ("type what you
        // cover") — name lookups rank by similarity, not just substring.
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
            DB::statement('CREATE INDEX locations_name_trgm ON locations USING gin (name gin_trgm_ops)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('locations');
    }
};
