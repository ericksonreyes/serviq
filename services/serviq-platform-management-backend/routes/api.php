<?php

use App\Http\Controllers\FeatureFlagController;
use App\Http\Controllers\PlanController;
use App\Http\Controllers\TenantController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'platform-management-backend']));

// Service-provider self-signup — anonymous, throttled like IAM's auth
// routes (SERVICE_PROVIDER.MD onboarding). Everything else needs a token.
Route::post('/v1/tenants/signup', [TenantController::class, 'signup'])->middleware('throttle:5,1');

// Platform Management is operated by Platform Administrators only — a
// platform-scoped token with the coarse role gate.
Route::prefix('v1')->middleware(['jwt.auth', 'role:Platform Administrator'])->group(function () {
    Route::get('/plans', [PlanController::class, 'index']);
    Route::post('/plans', [PlanController::class, 'store']);
    Route::get('/plans/{plan}', [PlanController::class, 'show']);
    Route::patch('/plans/{plan}', [PlanController::class, 'update']);

    Route::get('/tenants', [TenantController::class, 'index']);
    Route::post('/tenants', [TenantController::class, 'store']);
    Route::get('/tenants/{tenant}', [TenantController::class, 'show']);
    Route::patch('/tenants/{tenant}', [TenantController::class, 'update']);
    Route::post('/tenants/{tenant}/activate', [TenantController::class, 'activate']);
    Route::post('/tenants/{tenant}/suspend', [TenantController::class, 'suspend']);
    Route::post('/tenants/{tenant}/deactivate', [TenantController::class, 'deactivate']);

    Route::get('/feature-flags', [FeatureFlagController::class, 'index']);
    Route::put('/feature-flags', [FeatureFlagController::class, 'upsert']);
});
