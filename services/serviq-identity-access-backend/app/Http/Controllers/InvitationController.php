<?php

namespace App\Http\Controllers;

use App\Models\Invitation;
use App\Models\RefreshToken;
use App\Models\Role;
use App\Models\TenantScope;
use App\Models\User;
use App\Services\DomainEventRecorder;
use App\Services\JwtIssuer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Email invitations — a staff member invites a customer or agent; the
 * invitee accepts at the portal's /provider/<slug>/signup?invite=<token>
 * page. The raw token leaves only in the event payload (the notification
 * pipeline renders the email); the API returns it too for dev convenience.
 */
class InvitationController
{
    /** Portal base per role — where the invitee's accept page lives. */
    private function portalBase(string $role): string
    {
        return rtrim($role === Role::SERVICE_AGENT
            ? env('INVITE_URL_AGENT', 'http://localhost:3001')
            : env('INVITE_URL_CUSTOMER', 'http://localhost:3000'), '/');
    }

    private function acceptUrl(Invitation $invite, string $token, ?string $slug): string
    {
        return $this->portalBase($invite->role)."/provider/{$slug}/signup?invite={$token}";
    }

    /** Staff creates an invite for their tenant — needs iam.users.manage. */
    public function store(string $tenant, Request $request, DomainEventRecorder $events): JsonResponse
    {
        // Non-platform callers invite only into their own tenant.
        $callerTenant = $request->attributes->get('jwt')['tenant_id'] ?? null;
        abort_if($callerTenant !== null && $callerTenant !== $tenant, 403, 'Cannot invite outside your tenant');
        abort_unless(TenantScope::where('id', $tenant)->exists(), 404);

        $data = $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', 'string', Rule::in(Invitation::INVITABLE_ROLES)],
        ]);
        $actorId = $request->attributes->get('jwt')['sub'] ?? null;

        [$invite, $token] = Invitation::issue($tenant, $data['email'], $data['role'], $actorId);
        $slug = TenantScope::where('id', $tenant)->value('slug');
        $url = $this->acceptUrl($invite, $token, $slug);

        $events->record('Identity.InvitationCreated', [
            'invitation_id' => $invite->id, 'email' => $invite->email, 'role' => $invite->role,
            'tenant_slug' => $slug, 'token' => $token, 'accept_url' => $url,
            'invited_by' => $actorId,
        ], $tenant);

        return response()->json(['data' => $invite->makeHidden('token_hash')->toArray() + ['accept_url' => $url]], 201);
    }

    /** Public — the accept page reads invite details by token. */
    public function show(string $token): JsonResponse
    {
        $invite = Invitation::where('token_hash', Invitation::hash($token))->first();
        abort_if($invite === null, 404, 'Unknown invitation');

        return response()->json(['data' => [
            'email' => $invite->email, 'role' => $invite->role,
            'tenant_slug' => TenantScope::where('id', $invite->scope)->value('slug'),
            'status' => $invite->isUsable() ? 'pending' : ($invite->expires_at->isPast() ? 'expired' : $invite->status),
            'expires_at' => $invite->expires_at,
        ]]);
    }

    /** Public — accept: creates the account in the invited role. */
    public function accept(string $token, Request $request, JwtIssuer $issuer, DomainEventRecorder $events): JsonResponse
    {
        $invite = Invitation::where('token_hash', Invitation::hash($token))->first();
        abort_if($invite === null, 404, 'Unknown invitation');
        abort_unless($invite->isUsable(), 410, 'Invitation is '.$invite->status);

        $data = $request->validate([
            'username' => [
                'required', 'string', 'max:100',
                Rule::unique('users', 'username')->where('scope', $invite->scope),
            ],
            'display_name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = DB::transaction(function () use ($invite, $data, $events) {
            $user = User::create([
                'scope' => $invite->scope, 'username' => $data['username'],
                'email' => $invite->email, 'display_name' => $data['display_name'],
                'password' => $data['password'],
            ]);
            $role = Role::firstOrCreate(
                ['scope' => $invite->scope, 'name' => $invite->role],
                ['description' => 'Invited accounts'],
            );
            $user->roles()->sync([$role->id]);
            $invite->update(['status' => Invitation::ACCEPTED, 'accepted_by' => $user->id]);

            $events->record('Identity.UserRegistered', [
                'user_id' => $user->id, 'scope' => $user->scope,
                'username' => $user->username, 'roles' => $user->roleNames(),
                'source' => 'invitation', 'invited_by' => $invite->invited_by,
            ], $user->tenantId());

            return $user;
        });

        $issued = $issuer->issue($user);

        return response()->json([
            'token_type' => 'Bearer',
            'access_token' => $issued['token'],
            'expires_in' => $issued['expires_in'],
            'refresh_token' => RefreshToken::issueFor($user),
            'data' => $user->load('roles'),
        ], 201);
    }
}
