<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Curated self-service/dispatch knowledge — repair and troubleshooting
        // guides per tenant, searched by the customer/dispatcher chat surfaces.
        Schema::create('repair_guides', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('title');
            $table->text('body');
            $table->jsonb('tags')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
        });

        // Named service areas a provider covers. Catalog services still keep
        // their own `service_areas` jsonb of area names they serve.
        Schema::create('service_areas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('name');
            $table->string('description')->nullable();
            $table->jsonb('geo')->nullable();       // free-form geo descriptor (polygon, barangays, zips)
            $table->timestamps();

            $table->unique(['tenant_id', 'name']);
        });

        // Tenant business settings — operating hours, cancellation policy,
        // operational flags. Free-form JSON, owned by this context.
        Schema::create('tenant_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->unique();
            $table->jsonb('settings');
            $table->timestamps();
        });

        // How the catalog price is interpreted: flat job price, hourly rate,
        // or quote-only (price shown is an estimate).
        Schema::table('services', function (Blueprint $table) {
            $table->string('price_type')->default('flat')->after('currency'); // flat | hourly | quote
        });
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->dropColumn('price_type');
        });
        Schema::dropIfExists('tenant_settings');
        Schema::dropIfExists('service_areas');
        Schema::dropIfExists('repair_guides');
    }
};
