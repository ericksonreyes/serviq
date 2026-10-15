<?php

use App\Http\Controllers\CompanyAccountController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\PaymentEvidenceController;
use App\Http\Controllers\RefundRequestController;
use App\Http\Controllers\RemittanceController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'billing-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope', 'tenant.rls'])->group(function () {
    Route::get('/tenants/{tenant}/invoices', [InvoiceController::class, 'index']);
    Route::get('/tenants/{tenant}/invoices/{invoice}', [InvoiceController::class, 'show']);
    Route::post('/tenants/{tenant}/invoices/{invoice}/pay', [InvoiceController::class, 'pay'])->middleware('permission:billing.payments.record');

    // Refunds — request intake, Support decision approves, gated execute.
    Route::get('/tenants/{tenant}/refund-requests', [RefundRequestController::class, 'index']);
    Route::post('/tenants/{tenant}/refund-requests', [RefundRequestController::class, 'store'])->middleware('permission:billing.remit');
    Route::post('/tenants/{tenant}/refund-requests/{refundRequest}/execute', [RefundRequestController::class, 'execute'])->middleware('permission:billing.remit');

    // AI-parsed payment evidence — intake, review queue, dispatcher resolution.
    Route::get('/tenants/{tenant}/payment-evidence', [PaymentEvidenceController::class, 'index']);
    Route::post('/tenants/{tenant}/payment-evidence', [PaymentEvidenceController::class, 'store'])->middleware('permission:billing.payments.record');
    Route::post('/tenants/{tenant}/payment-evidence/{evidence}/review', [PaymentEvidenceController::class, 'review'])->middleware('permission:billing.remit');
    Route::get('/tenants/{tenant}/payment-evidence/{evidence}/file', [PaymentEvidenceController::class, 'file']);

    // Receiving accounts the recipient check matches against.
    Route::get('/tenants/{tenant}/company-accounts', [CompanyAccountController::class, 'index']);
    Route::post('/tenants/{tenant}/company-accounts', [CompanyAccountController::class, 'store'])->middleware('permission:billing.remit');
    Route::delete('/tenants/{tenant}/company-accounts/{account}', [CompanyAccountController::class, 'destroy'])->middleware('permission:billing.remit');

    // Remittances — expected cash, turn-ins, deposit-slip batches, digital bulk-mark.
    Route::get('/tenants/{tenant}/remittances', [RemittanceController::class, 'index']);
    Route::get('/tenants/{tenant}/remittances/expected', [RemittanceController::class, 'expected']);
    Route::get('/tenants/{tenant}/remittances/{remittance}', [RemittanceController::class, 'show']);
    Route::post('/tenants/{tenant}/remittances/turn-ins', [RemittanceController::class, 'turnIn'])->middleware('permission:billing.payments.record');
    Route::post('/tenants/{tenant}/remittances/batches', [RemittanceController::class, 'batch'])->middleware('permission:billing.payments.record');
    Route::post('/tenants/{tenant}/remittances/digital', [RemittanceController::class, 'digital'])->middleware('permission:billing.remit');
    Route::post('/tenants/{tenant}/remittances/{remittance}/confirm', [RemittanceController::class, 'confirm'])->middleware('permission:billing.remit');
});
