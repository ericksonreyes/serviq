<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireRole
{
    public function handle(Request $request, Closure $next, string $role): Response
    {
        $identity = $request->user();

        if ($identity === null || ! in_array($role, $identity->roles(), true)) {
            return response()->json([
                'error' => 'forbidden',
                'message' => 'Missing required role: '.$role,
            ], 403);
        }

        return $next($request);
    }
}
