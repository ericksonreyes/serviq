<?php

namespace App\Http\Controllers;

use App\Models\RefreshToken;
use App\Models\Role;
use App\Models\TenantScope;
use App\Models\User;
use App\Services\DomainEventRecorder;
use App\Services\JwtIssuer;
use App\Services\TokenBlacklist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AuthController
{
    /**
     * Public self-signup (CUSTOMER.MD / SERVICE_AGENT.MD onboarding).
     * Registers into a tenant scope — signups always belong to a service
     * provider — with one of the self-serve roles. Privileged roles are
     * never self-assignable: Tenant Administrator is provisioned via tenant
     * signup, Dispatcher/Customer Support via invite or admin grant.
     * Anonymous, like login, and throttled the same way.
     */
    public const SELF_SERVE_ROLES = [Role::CUSTOMER, Role::SERVICE_AGENT];

    public function register(Request $request, JwtIssuer $issuer, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['nullable', 'uuid', Rule::exists('tenant_scopes', 'id')],
            'tenant' => ['nullable', 'string', 'alpha_dash', 'max:100'],
            'role' => ['nullable', 'string', Rule::in(self::SELF_SERVE_ROLES)],
            'username' => [
                'required', 'string', 'max:100',
                Rule::unique('users', 'username')->where('scope', $request->input('tenant_id')),
            ],
            'email' => ['required', 'email'],
            'display_name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        // 'tenant' is the public handle — slug (or UUID) resolved to the scope id.
        $scope = $data['tenant_id'] ?? null;
        if ($scope === null && isset($data['tenant'])) {
            $scope = Str::isUuid($data['tenant'])
                ? $data['tenant']
                : TenantScope::where('slug', $data['tenant'])->value('id');
        }
        abort_if($scope === null || ! TenantScope::where('id', $scope)->exists(), 422, 'Unknown tenant');
        $data['tenant_id'] = $scope;
        $roleName = $data['role'] ?? Role::CUSTOMER;

        $user = DB::transaction(function () use ($data, $scope, $roleName, $events) {
            $user = User::create([
                'scope' => $scope,
                'username' => $data['username'],
                'email' => $data['email'],
                'display_name' => $data['display_name'],
                'password' => $data['password'],
            ]);

            $role = Role::firstOrCreate(
                ['scope' => $scope, 'name' => $roleName],
                ['description' => 'Self-registered accounts'],
            )->syncDefaultPermissions();
            $user->roles()->sync([$role->id]);

            $events->record('Identity.UserRegistered', [
                'user_id' => $user->id,
                'scope' => $user->scope,
                'username' => $user->username,
                'roles' => $user->roleNames(),
                'source' => 'self_signup',
            ], $user->tenantId());

            return $user;
        });

        $issued = $this->issueTokens($user, $issuer);

        return response()->json([
            'token_type' => 'Bearer',
            'access_token' => $issued['token'],
            'expires_in' => $issued['expires_in'],
            'refresh_token' => $issued['refresh_token'],
            'data' => $user->load('roles'),
        ], 201);
    }

    /**
     * Public login — an anonymous endpoint on the service
     * (INTERNAL_SERVICE_SECURITY.MD). Authentication resolves the pair
     * (scope, username); a username alone is ambiguous.
     */
    public function login(Request $request, JwtIssuer $issuer): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
            // 'platform', a tenant UUIDv7, or the tenant's slug.
            'tenant_id' => ['nullable', 'uuid'],
            'tenant' => ['nullable', 'string', 'alpha_dash', 'max:100'],
            'scope' => ['nullable', 'string', Rule::in([User::SCOPE_PLATFORM])],
        ]);

        $scope = $data['tenant_id'] ?? $data['scope'] ?? User::SCOPE_PLATFORM;
        if (isset($data['tenant'])) {
            $scope = Str::isUuid($data['tenant'])
                ? $data['tenant']
                : (TenantScope::where('slug', $data['tenant'])->value('id') ?? $data['tenant']);
        }

        $user = User::where('scope', $scope)->where('username', $data['username'])->first();

        if ($user === null || ! Hash::check($data['password'], $user->password) || ! $user->isActive()) {
            return response()->json([
                'error' => 'invalid_credentials',
                'message' => 'Invalid credentials',
            ], 401);
        }

        $issued = $this->issueTokens($user, $issuer);

        return response()->json([
            'token_type' => 'Bearer',
            'access_token' => $issued['token'],
            'expires_in' => $issued['expires_in'],
            'refresh_token' => $issued['refresh_token'],
        ]);
    }

    /**
     * Token rotation — an anonymous endpoint like login. Present a live
     * refresh token, get a fresh access token + a rotated refresh token.
     * The presented token is revoked in the same transaction, so a reused
     * (stolen) refresh token fails closed on second use.
     */
    public function refresh(Request $request, JwtIssuer $issuer): JsonResponse
    {
        $data = $request->validate(['refresh_token' => ['required', 'string']]);

        $stored = RefreshToken::findValid($data['refresh_token']);
        if ($stored === null || ! $stored->user?->isActive()) {
            return response()->json([
                'error' => 'invalid_refresh_token',
                'message' => 'Refresh token is invalid or expired',
            ], 401);
        }

        $issued = DB::transaction(function () use ($stored, $issuer) {
            $stored->update(['revoked_at' => now()]);

            return $this->issueTokens($stored->user, $issuer);
        });

        return response()->json([
            'token_type' => 'Bearer',
            'access_token' => $issued['token'],
            'expires_in' => $issued['expires_in'],
            'refresh_token' => $issued['refresh_token'],
        ]);
    }

    /**
     * Logout revokes the presented token by jti on the shared blacklist —
     * and the caller's refresh token when provided, ending the session.
     */
    public function logout(Request $request, TokenBlacklist $blacklist): JsonResponse
    {
        $claims = $request->attributes->get('jwt');
        $blacklist->revoke($claims['jti'], $claims['exp']);

        if ($raw = $request->input('refresh_token')) {
            RefreshToken::where('token_hash', hash('sha256', $raw))->update(['revoked_at' => now()]);
        }

        return response()->json(['revoked' => true]);
    }

    /** Access JWT + a rotated refresh credential, as one unit. */
    private function issueTokens(User $user, JwtIssuer $issuer): array
    {
        return $issuer->issue($user) + ['refresh_token' => RefreshToken::issueFor($user)];
    }

    public function me(Request $request): JsonResponse
    {
        $identity = $request->user();

        $tenantSlug = $identity->tenantId() === User::SCOPE_PLATFORM
            ? null
            : TenantScope::where('id', $identity->tenantId())->value('slug');

        return response()->json([
            'sub' => $identity->userId(),
            'tenant_id' => $identity->tenantId(),
            'tenant_slug' => $tenantSlug,
            'roles' => $identity->roles(),
            'permissions' => $identity->permissions(),
        ]);
    }
}
