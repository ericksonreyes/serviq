<?php

use App\Http\Middleware\JwtAuthenticate;
use App\Http\Middleware\RequirePermission;
use App\Http\Middleware\RequireRole;
use App\Http\Middleware\RequireTenantScope;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'jwt.auth' => JwtAuthenticate::class,
            'permission' => RequirePermission::class,
            'role' => RequireRole::class,
            'tenant.scope' => RequireTenantScope::class,
            'tenant.rls' => \App\Http\Middleware\SetTenantContext::class,
        ]);
        // Route-model binding resolves inside SubstituteBindings — before
        // custom route middleware — so the tenant GUC must be set ahead of
        // it or RLS hides the bound row and every {model} route 404s.
        $middleware->prependToPriorityList(
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
            \App\Http\Middleware\SetTenantContext::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
