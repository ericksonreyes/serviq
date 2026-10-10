<?php

use App\Http\Controllers\AgentController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'workforce-management-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/agents', [AgentController::class, 'index']);
    Route::get('/tenants/{tenant}/agents/eligible', [AgentController::class, 'eligible']);
    Route::post('/agents', [AgentController::class, 'store']);
    Route::get('/tenants/{tenant}/agents/{agent}', [AgentController::class, 'show']);
    Route::patch('/tenants/{tenant}/agents/{agent}', [AgentController::class, 'update']);
});
