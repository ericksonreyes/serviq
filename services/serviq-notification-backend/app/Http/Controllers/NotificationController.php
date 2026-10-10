<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController
{
    /** The in-app feed — filtered to the caller when they're not platform. */
    public function index(Request $request, string $tenant): JsonResponse
    {
        $identity = $request->user();

        $feed = Notification::where('tenant_id', $tenant)
            ->when($request->query('unread'), fn ($q) => $q->whereNull('read_at'))
            ->latest()
            ->paginate(50);

        return response()->json($feed);
    }

    public function markRead(Request $request, string $tenant, Notification $notification): JsonResponse
    {
        abort_unless($notification->tenant_id === $tenant, 404);
        $notification->update(['read_at' => now()]);

        return response()->json(['data' => $notification]);
    }
}
