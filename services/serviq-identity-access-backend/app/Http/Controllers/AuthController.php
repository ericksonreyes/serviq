<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\JwtIssuer;
use App\Services\TokenBlacklist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class AuthController
{
    /**
     * Public login — the only anonymous endpoint on the service
     * (INTERNAL_SERVICE_SECURITY.MD). Authentication resolves the pair
     * (scope, username); a username alone is ambiguous.
     */
    public function login(Request $request, JwtIssuer $issuer): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
            // 'platform' or a tenant UUIDv7. Defaults to platform scope.
            'tenant_id' => ['nullable', 'uuid'],
            'scope' => ['nullable', 'string', Rule::in([User::SCOPE_PLATFORM])],
        ]);

        $scope = $data['tenant_id'] ?? $data['scope'] ?? User::SCOPE_PLATFORM;

        $user = User::where('scope', $scope)->where('username', $data['username'])->first();

        if ($user === null || ! Hash::check($data['password'], $user->password) || ! $user->isActive()) {
            return response()->json([
                'error' => 'invalid_credentials',
                'message' => 'Invalid credentials',
            ], 401);
        }

        $issued = $issuer->issue($user);

        return response()->json([
            'token_type' => 'Bearer',
            'access_token' => $issued['token'],
            'expires_in' => $issued['expires_in'],
        ]);
    }

    /**
     * Logout revokes the presented token by jti on the shared blacklist.
     */
    public function logout(Request $request, TokenBlacklist $blacklist): JsonResponse
    {
        $claims = $request->attributes->get('jwt');
        $blacklist->revoke($claims['jti'], $claims['exp']);

        return response()->json(['revoked' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        $identity = $request->user();

        return response()->json([
            'sub' => $identity->userId(),
            'tenant_id' => $identity->tenantId(),
            'roles' => $identity->roles(),
            'permissions' => $identity->permissions(),
        ]);
    }
}
