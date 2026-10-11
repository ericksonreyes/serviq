<?php

use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\PaymentEvidenceController;
use App\Http\Controllers\RefundRequestController;
use App\Http\Controllers\RemittanceController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'billing-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/invoices', [InvoiceController::class, 'index']);
    Route::get('/tenants/{tenant}/invoices/{invoice}', [InvoiceController::class, 'show']);
    Route::post('/tenants/{tenant}/invoices/{invoice}/pay', [InvoiceController::class, 'pay']);

    // Refunds — request intake, Support decision approves, gated execute.
    Route::get('/tenants/{tenant}/refund-requests', [RefundRequestController::class, 'index']);
    Route::post('/tenants/{tenant}/refund-requests', [RefundRequestController::class, 'store']);
    Route::post('/tenants/{tenant}/refund-requests/{refundRequest}/execute', [RefundRequestController::class, 'execute']);

    // AI-parsed payment evidence — intake, review queue, dispatcher resolution.
    Route::get('/tenants/{tenant}/payment-evidence', [PaymentEvidenceController::class, 'index']);
    Route::post('/tenants/{tenant}/payment-evidence', [PaymentEvidenceController::class, 'store']);
    Route::post('/tenants/{tenant}/payment-evidence/{evidence}/review', [PaymentEvidenceController::class, 'review']);

    // Remittances — expected cash, turn-ins, deposit-slip batches, digital bulk-mark.
    Route::get('/tenants/{tenant}/remittances', [RemittanceController::class, 'index']);
    Route::get('/tenants/{tenant}/remittances/expected', [RemittanceController::class, 'expected']);
    Route::get('/tenants/{tenant}/remittances/{remittance}', [RemittanceController::class, 'show']);
    Route::post('/tenants/{tenant}/remittances/turn-ins', [RemittanceController::class, 'turnIn']);
    Route::post('/tenants/{tenant}/remittances/batches', [RemittanceController::class, 'batch']);
    Route::post('/tenants/{tenant}/remittances/digital', [RemittanceController::class, 'digital']);
    Route::post('/tenants/{tenant}/remittances/{remittance}/confirm', [RemittanceController::class, 'confirm']);
});
