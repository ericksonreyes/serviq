<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Stored notifications — the in-app feed is always available; other
        // channels are adapter-gated by config.
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('user_id')->nullable()->index();
            $table->string('channel');                  // in_app | email | sms | push | webhook
            $table->string('event_type');
            $table->string('title');
            $table->text('body');
            $table->jsonb('context')->nullable();       // event payload used for rendering
            $table->string('status')->default('delivered'); // in-app rows are "delivered" on write
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        // Templates are data, not code — tenant override wins over the
        // system default (tenant_id null = default).
        Schema::create('notification_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->nullable();
            $table->string('event_type');               // e.g. Job.Completed
            $table->string('channel')->default('in_app');
            $table->string('title_template');
            $table->text('body_template');
            $table->timestamps();

            $table->unique(['tenant_id', 'event_type', 'channel']);
        });

        // Tenant channel switches (which channels exist at all).
        Schema::create('tenant_channels', function (Blueprint $table) {
            $table->uuid('tenant_id');
            $table->string('channel');
            $table->boolean('enabled')->default(true);
            $table->primary(['tenant_id', 'channel']);
        });

        // Per-event routing rules (tenant_id null = default route).
        Schema::create('event_routes', function (Blueprint $table) {
            $table->uuid('tenant_id')->nullable();
            $table->string('event_type');
            $table->string('channel');
            $table->primary(['tenant_id', 'event_type', 'channel']);
        });

        // User opt-outs per channel.
        Schema::create('user_preferences', function (Blueprint $table) {
            $table->uuid('tenant_id');
            $table->uuid('user_id');
            $table->string('channel');
            $table->boolean('enabled')->default(false); // rows exist only when opted out
            $table->primary(['tenant_id', 'user_id', 'channel']);
        });

        Schema::create('outbox', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->jsonb('payload');
            $table->timestamp('occurred_at');
            $table->uuid('tenant_id')->nullable();
            $table->string('actor_service');
            $table->uuid('on_behalf_of')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->index('published_at');
        });

        Schema::create('processed_events', function (Blueprint $table) {
            $table->uuid('event_id')->primary();
            $table->timestamp('processed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('processed_events');
        Schema::dropIfExists('outbox');
        Schema::dropIfExists('user_preferences');
        Schema::dropIfExists('event_routes');
        Schema::dropIfExists('tenant_channels');
        Schema::dropIfExists('notification_templates');
        Schema::dropIfExists('notifications');
    }
};
