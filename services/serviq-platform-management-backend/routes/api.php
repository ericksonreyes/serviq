<?php

use App\Http\Controllers\FeatureFlagController;
use App\Http\Controllers\IncomeReportController;
use App\Http\Controllers\MetricsController;
use App\Http\Controllers\PlanController;
use App\Http\Controllers\ProviderDirectoryController;
use App\Http\Controllers\SubscriptionController;
use App\Http\Controllers\TenantController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'platform-management-backend']));

// Service-provider self-signup — anonymous, throttled like IAM's auth
// routes (SERVICE_PROVIDER.MD onboarding). Everything else needs a token.
Route::post('/v1/tenants/signup', [TenantController::class, 'signup'])->middleware('throttle:5,1');

// Public provider directory — the customer portal resolves provider home
// pages by slug from these. Active tenants only, display fields only.
Route::get('/v1/providers', [ProviderDirectoryController::class, 'index'])->middleware('throttle:60,1');
Route::get('/v1/providers/{slug}', [ProviderDirectoryController::class, 'show'])->middleware('throttle:60,1');

// Public feature-flag status — the same exposure class as the provider
// directory: BFFs and portals poll it to gate features without a token.
Route::get('/v1/feature-flags/{key}', [FeatureFlagController::class, 'status'])->middleware('throttle:60,1');

// Platform Management is operated by Platform Administrators only — a
// platform-scoped token with the coarse role gate.
Route::prefix('v1')->middleware(['jwt.auth', 'permission:platform.admin'])->group(function () {
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

    Route::get('/tenants/{tenant}/subscription', [SubscriptionController::class, 'show']);
    Route::put('/tenants/{tenant}/subscription', [SubscriptionController::class, 'update']);

    Route::get('/feature-flags', [FeatureFlagController::class, 'index']);
    Route::put('/feature-flags', [FeatureFlagController::class, 'upsert']);

    Route::get('/metrics/summary', [MetricsController::class, 'summary']);
    Route::get('/reports/income', [IncomeReportController::class, 'income']);
});
