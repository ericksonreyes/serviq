<?php

use App\Http\Controllers\CustomerAddressController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\ServiceRequestController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'customer-request-management-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/customers', [CustomerController::class, 'index']);
    Route::post('/customers', [CustomerController::class, 'store']);
    // Literal segment — must precede {customer} or it binds as an id.
    Route::get('/tenants/{tenant}/customers/by-user/{user}', [CustomerController::class, 'byUser']);
    Route::get('/tenants/{tenant}/customers/{customer}', [CustomerController::class, 'show']);
    Route::patch('/tenants/{tenant}/customers/{customer}', [CustomerController::class, 'update']);

    Route::get('/tenants/{tenant}/customers/{customer}/addresses', [CustomerAddressController::class, 'index']);
    Route::post('/tenants/{tenant}/customers/{customer}/addresses', [CustomerAddressController::class, 'store']);
    Route::patch('/tenants/{tenant}/customers/{customer}/addresses/{address}', [CustomerAddressController::class, 'update']);
    Route::delete('/tenants/{tenant}/customers/{customer}/addresses/{address}', [CustomerAddressController::class, 'destroy']);

    Route::get('/tenants/{tenant}/requests', [ServiceRequestController::class, 'index']);
    Route::post('/requests', [ServiceRequestController::class, 'store']);
    Route::get('/tenants/{tenant}/requests/{serviceRequest}', [ServiceRequestController::class, 'show']);
    Route::post('/tenants/{tenant}/requests/{serviceRequest}/cancel', [ServiceRequestController::class, 'cancel']);
    Route::post('/tenants/{tenant}/requests/{serviceRequest}/feedback', [ServiceRequestController::class, 'feedback']);
    Route::post('/tenants/{tenant}/requests/{serviceRequest}/convert', [ServiceRequestController::class, 'convert']);
});
