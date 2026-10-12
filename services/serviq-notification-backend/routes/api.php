<?php

use App\Http\Controllers\NotificationController;
use App\Http\Controllers\TemplateController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'notification-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/notifications', [NotificationController::class, 'index']);
    Route::post('/tenants/{tenant}/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/tenants/{tenant}/notifications/{notification}/read', [NotificationController::class, 'markRead']);

    Route::get('/tenants/{tenant}/notification-templates', [TemplateController::class, 'index']);
    Route::put('/tenants/{tenant}/notification-templates', [TemplateController::class, 'upsert'])->middleware('permission:notify.templates.manage');
    Route::put('/tenants/{tenant}/notification-channels', [TemplateController::class, 'channels'])->middleware('permission:notify.templates.manage');
});
