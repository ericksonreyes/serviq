<?php

use App\Http\Controllers\JobController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'service-job-management-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/jobs', [JobController::class, 'index']);
    Route::get('/tenants/{tenant}/jobs/{job}', [JobController::class, 'show']);
    Route::get('/tenants/{tenant}/jobs/{job}/history', [JobController::class, 'history']);
    Route::post('/tenants/{tenant}/jobs/{job}/replay', [JobController::class, 'replay'])->middleware('permission:dispatch.assignments.manage');

    Route::post('/tenants/{tenant}/jobs/{job}/confirm', [JobController::class, 'confirm'])->middleware('permission:dispatch.assignments.manage');
    Route::post('/tenants/{tenant}/jobs/{job}/ready', [JobController::class, 'ready'])->middleware('permission:dispatch.assignments.manage');
    Route::post('/tenants/{tenant}/jobs/{job}/assign', [JobController::class, 'assign'])->middleware('permission:dispatch.assignments.manage');
    Route::post('/tenants/{tenant}/jobs/{job}/accept', [JobController::class, 'accept'])->middleware('permission:jobs.execute');
    Route::post('/tenants/{tenant}/jobs/{job}/start', [JobController::class, 'start'])->middleware('permission:jobs.execute');
    Route::post('/tenants/{tenant}/jobs/{job}/cancel', [JobController::class, 'cancel'])->middleware('permission:dispatch.assignments.manage');
    Route::post('/tenants/{tenant}/jobs/{job}/reschedule', [JobController::class, 'reschedule'])->middleware('permission:dispatch.assignments.manage');
    Route::put('/tenants/{tenant}/jobs/{job}/steps', [JobController::class, 'reorder'])->middleware('permission:dispatch.assignments.manage');
    Route::post('/tenants/{tenant}/jobs/{job}/steps/{position}/start', [JobController::class, 'stepStart'])->middleware('permission:jobs.execute');
    Route::post('/tenants/{tenant}/jobs/{job}/steps/{position}/close', [JobController::class, 'stepClose'])->middleware('permission:jobs.execute');
});
