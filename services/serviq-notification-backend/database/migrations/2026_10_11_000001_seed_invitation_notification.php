<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    // Demo tenant (install seeds this fixed id — see LOCAL_DEVELOPMENT).
    private const DEMO_TENANT = '01ac0000-0000-7000-8000-00000000acde';

    public function up(): void
    {
        // Global default templates for the invite email (tenant_id null).
        foreach (['in_app', 'email'] as $channel) {
            DB::table('notification_templates')->insertOrIgnore([
                'id' => (string) Str::uuid7(), 'tenant_id' => null,
                'event_type' => 'Identity.InvitationCreated', 'channel' => $channel,
                'title_template' => 'You are invited to {{tenant_slug}} as {{role}}',
                'body_template' => 'You were invited as {{role}}. Accept your invitation: {{accept_url}}',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        // Enable the email channel for the demo tenant — invitations
        // land as stored email-channel notifications until an SMTP
        // adapter ships (channels are adapter-gated by design).
        foreach (['in_app', 'email'] as $channel) {
            DB::table('tenant_channels')->insertOrIgnore([
                'tenant_id' => self::DEMO_TENANT, 'channel' => $channel, 'enabled' => true,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('notification_templates')->where('event_type', 'Identity.InvitationCreated')->delete();
        DB::table('tenant_channels')->where('tenant_id', self::DEMO_TENANT)
            ->whereIn('channel', ['in_app', 'email'])->delete();
    }
};
