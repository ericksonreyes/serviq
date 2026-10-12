<?php

use App\Http\Controllers\AssignmentController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'assignment-dispatch-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/assignments', [AssignmentController::class, 'index']);
    Route::get('/tenants/{tenant}/dispatch/queue', [AssignmentController::class, 'queue']);
    Route::get('/tenants/{tenant}/dispatch/recommend', [AssignmentController::class, 'recommend']);
    Route::get('/tenants/{tenant}/offers', [AssignmentController::class, 'offers']);
    Route::get('/tenants/{tenant}/dispatch/rules', [AssignmentController::class, 'rules']);
    Route::put('/tenants/{tenant}/dispatch/rules', [AssignmentController::class, 'configure']);

    Route::post('/tenants/{tenant}/dispatch/assign', [AssignmentController::class, 'assign']);
    Route::post('/tenants/{tenant}/dispatch/broadcast', [AssignmentController::class, 'broadcast']);
    Route::post('/tenants/{tenant}/dispatch/self-assign', [AssignmentController::class, 'selfAssign']);
    Route::post('/tenants/{tenant}/assignments/{assignment}/accept', [AssignmentController::class, 'accept']);
    Route::post('/tenants/{tenant}/assignments/{assignment}/reject', [AssignmentController::class, 'reject']);
});
