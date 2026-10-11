<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $identity = $request->user();

        if ($identity === null || ! $identity->hasPermission($permission)) {
            return response()->json([
                'error' => 'forbidden',
                'message' => 'Missing required permission: '.$permission,
            ], 403);
        }

        return $next($request);
    }
}
