<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\JwksController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\TenantController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'identity-access-backend']));
Route::get('/jwks', JwksController::class);

Route::prefix('v1')->group(function () {
    // The only anonymous routes on the service (INTERNAL_SERVICE_SECURITY.MD).
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:5,1');

    Route::middleware('jwt.auth')->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);

        Route::get('/tenants', [TenantController::class, 'index'])->middleware('permission:iam.tenants.read');
        Route::post('/tenants', [TenantController::class, 'store'])->middleware('permission:iam.tenants.manage');

        Route::get('/permissions', [PermissionController::class, 'index'])->middleware('permission:iam.roles.read');

        Route::get('/roles', [RoleController::class, 'index'])->middleware('permission:iam.roles.read');
        Route::post('/roles', [RoleController::class, 'store'])->middleware('permission:iam.roles.manage');
        Route::post('/roles/{role}/permissions', [RoleController::class, 'grantPermissions'])->middleware('permission:iam.roles.manage');

        Route::get('/users', [UserController::class, 'index'])->middleware('permission:iam.users.read');
        Route::post('/users', [UserController::class, 'store'])->middleware('permission:iam.users.manage');
        Route::get('/users/{user}', [UserController::class, 'show'])->middleware('permission:iam.users.read');
        Route::patch('/users/{user}', [UserController::class, 'update'])->middleware('permission:iam.users.manage');
        Route::post('/users/{user}/roles', [UserController::class, 'assignRoles'])->middleware('permission:iam.users.manage');
    });
});
