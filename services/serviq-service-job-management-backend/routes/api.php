<?php

use App\Http\Controllers\JobController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'service-job-management-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/jobs', [JobController::class, 'index']);
    Route::get('/tenants/{tenant}/jobs/{job}', [JobController::class, 'show']);
    Route::get('/tenants/{tenant}/jobs/{job}/history', [JobController::class, 'history']);
    Route::post('/tenants/{tenant}/jobs/{job}/replay', [JobController::class, 'replay']);

    Route::post('/tenants/{tenant}/jobs/{job}/confirm', [JobController::class, 'confirm']);
    Route::post('/tenants/{tenant}/jobs/{job}/ready', [JobController::class, 'ready']);
    Route::post('/tenants/{tenant}/jobs/{job}/assign', [JobController::class, 'assign']);
    Route::post('/tenants/{tenant}/jobs/{job}/accept', [JobController::class, 'accept']);
    Route::post('/tenants/{tenant}/jobs/{job}/start', [JobController::class, 'start']);
    Route::post('/tenants/{tenant}/jobs/{job}/cancel', [JobController::class, 'cancel']);
    Route::put('/tenants/{tenant}/jobs/{job}/steps', [JobController::class, 'reorder']);
    Route::post('/tenants/{tenant}/jobs/{job}/steps/{position}/start', [JobController::class, 'stepStart']);
    Route::post('/tenants/{tenant}/jobs/{job}/steps/{position}/close', [JobController::class, 'stepClose']);
});
