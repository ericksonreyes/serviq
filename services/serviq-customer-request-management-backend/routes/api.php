<?php

use App\Http\Controllers\CustomerController;
use App\Http\Controllers\ServiceRequestController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'customer-request-management-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/customers', [CustomerController::class, 'index']);
    Route::post('/customers', [CustomerController::class, 'store']);
    Route::get('/tenants/{tenant}/customers/{customer}', [CustomerController::class, 'show']);

    Route::get('/tenants/{tenant}/requests', [ServiceRequestController::class, 'index']);
    Route::post('/requests', [ServiceRequestController::class, 'store']);
    Route::get('/tenants/{tenant}/requests/{serviceRequest}', [ServiceRequestController::class, 'show']);
    Route::post('/tenants/{tenant}/requests/{serviceRequest}/cancel', [ServiceRequestController::class, 'cancel']);
    Route::post('/tenants/{tenant}/requests/{serviceRequest}/convert', [ServiceRequestController::class, 'convert']);
});
