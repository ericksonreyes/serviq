<?php

use App\Http\Controllers\InvoiceController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'billing-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/invoices', [InvoiceController::class, 'index']);
    Route::get('/tenants/{tenant}/invoices/{invoice}', [InvoiceController::class, 'show']);
    Route::post('/tenants/{tenant}/invoices/{invoice}/pay', [InvoiceController::class, 'pay']);
    Route::post('/tenants/{tenant}/remittances', [InvoiceController::class, 'remit']);
    Route::get('/tenants/{tenant}/remittances', [InvoiceController::class, 'remittances']);
});
