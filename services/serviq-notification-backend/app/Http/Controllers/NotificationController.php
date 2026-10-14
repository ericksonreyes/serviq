<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class NotificationController
{
    /** The in-app feed — filtered to the caller when they're not platform. */
    public function index(Request $request, string $tenant): JsonResponse
    {
        $identity = $request->user();

        // user_id accepts one or several ids — a recipient can be addressed
        // by CRM customer id (domain events) or IAM sub (user events); the
        // caller's BFF whitelists which ids it may ask about.
        $feed = Notification::where('tenant_id', $tenant)
            ->when($request->query('unread'), fn ($q) => $q->whereNull('read_at'))
            ->when($request->query('user_id'), fn ($q, $u) => $q->whereIn('user_id', Arr::wrap($u)))
            ->latest()
            ->paginate(50);

        return response()->json($feed);
    }

    /** Bulk read — same visibility as the feed (tenant-wide, or per user_id). */
    public function markAllRead(Request $request, string $tenant): JsonResponse
    {
        $marked = Notification::where('tenant_id', $tenant)
            ->whereNull('read_at')
            ->when($request->query('user_id'), fn ($q, $u) => $q->whereIn('user_id', Arr::wrap($u)))
            ->update(['read_at' => now()]);

        return response()->json(['data' => ['marked' => $marked]]);
    }

    public function markRead(Request $request, string $tenant, Notification $notification): JsonResponse
    {
        abort_unless($notification->tenant_id === $tenant, 404);
        $notification->update(['read_at' => now()]);

        return response()->json(['data' => $notification]);
    }
}
