<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Links the CRM customer record to the caller's IAM user (sub) —
        // the `customers/by-user/{user_id}` lookup resolves on this.
        Schema::table('customers', function (Blueprint $table) {
            $table->uuid('user_id')->nullable()->index()->after('tenant_id');
        });

        // The customer's address book — a request may reference one entry
        // or carry an inline address in its details.
        Schema::create('customer_addresses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('customer_id')->index();
            $table->string('label')->nullable();      // Home, Office, …
            $table->jsonb('address');                 // line1, barangay, city, lat/lng
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::table('service_requests', function (Blueprint $table) {
            $table->date('preferred_date')->nullable()->after('service_id');
            $table->timestamp('scheduled_for')->nullable()->after('preferred_date');
            $table->uuid('address_id')->nullable()->index()->after('scheduled_for');
            $table->jsonb('feedback')->nullable()->after('details'); // {rating, comment, submitted_at}
        });
    }

    public function down(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dropColumn(['preferred_date', 'scheduled_for', 'address_id', 'feedback']);
        });

        Schema::dropIfExists('customer_addresses');

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('user_id');
        });
    }
};
