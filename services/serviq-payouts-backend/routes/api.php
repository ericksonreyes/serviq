<?php

use App\Http\Controllers\PayoutController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'payouts-backend']));

Route::prefix('v1')->middleware(['jwt.auth', 'tenant.scope'])->group(function () {
    Route::get('/tenants/{tenant}/payouts', [PayoutController::class, 'index']);
    Route::post('/tenants/{tenant}/payouts/{payout}/settle', [PayoutController::class, 'settle'])->middleware('permission:billing.remit');
});
