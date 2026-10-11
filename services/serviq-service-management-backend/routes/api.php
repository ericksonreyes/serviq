<?php

use App\Http\Controllers\CatalogServiceController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'service-management-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/services', [CatalogServiceController::class, 'index']);
    Route::post('/services', [CatalogServiceController::class, 'store']);
    Route::get('/tenants/{tenant}/services/{service}', [CatalogServiceController::class, 'show']);
    Route::patch('/tenants/{tenant}/services/{service}', [CatalogServiceController::class, 'update']);
    Route::put('/tenants/{tenant}/services/{service}/steps', [CatalogServiceController::class, 'reorderSteps']);
});
