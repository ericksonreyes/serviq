<?php

use App\Http\Controllers\ExecutionController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'field-service-execution-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/executions', [ExecutionController::class, 'index']);
    Route::get('/tenants/{tenant}/executions/{execution}', [ExecutionController::class, 'show']);
    Route::post('/tenants/{tenant}/executions/{execution}/check-in', [ExecutionController::class, 'checkIn']);
    Route::post('/tenants/{tenant}/executions/{execution}/evidence', [ExecutionController::class, 'uploadEvidence']);
    Route::post('/tenants/{tenant}/executions/{execution}/steps/{position}/start', [ExecutionController::class, 'stepStart']);
    Route::post('/tenants/{tenant}/executions/{execution}/steps/{position}/close', [ExecutionController::class, 'stepClose']);
    Route::post('/tenants/{tenant}/executions/{execution}/complete', [ExecutionController::class, 'complete']);
});
