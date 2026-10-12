<?php

use App\Http\Controllers\CatalogServiceController;
use App\Http\Controllers\RepairGuideController;
use App\Http\Controllers\ServiceAreaController;
use App\Http\Controllers\ServiceOperationsController;
use App\Http\Controllers\TenantSettingsController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'service-management-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/services', [CatalogServiceController::class, 'index']);
    Route::post('/services', [CatalogServiceController::class, 'store'])->middleware('permission:catalog.services.manage');
    Route::get('/tenants/{tenant}/services/{service}', [CatalogServiceController::class, 'show']);
    Route::patch('/tenants/{tenant}/services/{service}', [CatalogServiceController::class, 'update'])->middleware('permission:catalog.services.manage');
    Route::put('/tenants/{tenant}/services/{service}/steps', [CatalogServiceController::class, 'reorderSteps'])->middleware('permission:catalog.services.manage');

    Route::get('/tenants/{tenant}/services/{service}/availability', [ServiceOperationsController::class, 'availability']);
    Route::get('/tenants/{tenant}/services/{service}/pricing', [ServiceOperationsController::class, 'showPricing']);
    Route::put('/tenants/{tenant}/services/{service}/pricing', [ServiceOperationsController::class, 'updatePricing'])->middleware('permission:catalog.services.manage');

    Route::get('/tenants/{tenant}/repair-guides', [RepairGuideController::class, 'index']);
    Route::post('/tenants/{tenant}/repair-guides', [RepairGuideController::class, 'store'])->middleware('permission:catalog.services.manage');

    Route::get('/tenants/{tenant}/service-areas', [ServiceAreaController::class, 'index']);
    Route::post('/tenants/{tenant}/service-areas', [ServiceAreaController::class, 'store'])->middleware('permission:catalog.services.manage');
    Route::patch('/tenants/{tenant}/service-areas/{serviceArea}', [ServiceAreaController::class, 'update'])->middleware('permission:catalog.services.manage');
    Route::delete('/tenants/{tenant}/service-areas/{serviceArea}', [ServiceAreaController::class, 'destroy'])->middleware('permission:catalog.services.manage');

    Route::get('/tenants/{tenant}/settings', [TenantSettingsController::class, 'show']);
    Route::put('/tenants/{tenant}/settings', [TenantSettingsController::class, 'update'])->middleware('permission:catalog.services.manage');
});
