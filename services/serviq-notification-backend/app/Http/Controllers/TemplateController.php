<?php

namespace App\Http\Controllers;

use App\Models\NotificationTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TemplateController
{
    public function index(string $tenant): JsonResponse
    {
        $templates = NotificationTemplate::where(fn ($q) => $q->where('tenant_id', $tenant)->orWhereNull('tenant_id'))
            ->orderBy('event_type')->get();

        return response()->json(['data' => $templates]);
    }

    /** Tenant override — editing a template never requires a deploy. */
    public function upsert(Request $request, string $tenant): JsonResponse
    {
        $data = $request->validate([
            'event_type' => ['required', 'string', 'max:100'],
            'channel' => ['required', 'in:in_app,email,sms,push,webhook'],
            'title_template' => ['required', 'string'],
            'body_template' => ['required', 'string'],
        ]);

        $tpl = NotificationTemplate::updateOrCreate(
            ['tenant_id' => $tenant, 'event_type' => $data['event_type'], 'channel' => $data['channel']],
            ['title_template' => $data['title_template'], 'body_template' => $data['body_template']],
        );

        return response()->json(['data' => $tpl]);
    }

    public function channels(Request $request, string $tenant): JsonResponse
    {
        $data = $request->validate([
            'channels' => ['required', 'array'],
            'channels.*' => ['in:in_app,email,sms,push,webhook'],
        ]);

        DB::table('tenant_channels')->where('tenant_id', $tenant)->delete();
        foreach ($data['channels'] as $channel) {
            DB::table('tenant_channels')->insert(['tenant_id' => $tenant, 'channel' => $channel, 'enabled' => true]);
        }

        return response()->json(['data' => $data['channels']]);
    }
}
