<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $identity = $request->user();

        foreach ($permissions as $permission) {
            if ($identity !== null && $identity->hasPermission($permission)) {
                return $next($request);
            }
        }

        return response()->json([
            'error' => 'forbidden',
            'message' => 'Missing required permission: '.implode(' or ', $permissions),
        ], 403);
    }
}
