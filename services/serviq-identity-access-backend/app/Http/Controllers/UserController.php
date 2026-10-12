<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\User;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserController
{
    public function index(Request $request): JsonResponse
    {
        $caller = $request->user();
        $scope = $request->query('scope') ?? ($caller->isPlatform() ? null : $caller->tenantId());
        if ($scope !== null && ! $caller->canAccessScope($scope)) {
            return $this->scopeForbidden();
        }

        $users = User::with('roles')
            ->when($scope, fn ($q) => $q->where('scope', $scope))
            ->orderBy('scope')->orderBy('username')
            ->paginate(50);

        return response()->json($users);
    }

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'scope' => ['required', 'string'],
            'username' => ['required', 'string', 'max:100'],
            'password' => ['required', 'string', 'min:8'],
            'email' => ['nullable', 'email'],
            'display_name' => ['nullable', 'string', 'max:255'],
            'roles' => ['nullable', 'array'],
            'roles.*' => ['string'],
        ]);

        if (! $request->user()->canAccessScope($data['scope'])) {
            return $this->scopeForbidden();
        }

        $user = DB::transaction(function () use ($data, $events) {
            $user = User::create([
                'scope' => $data['scope'],
                'username' => $data['username'],
                'password' => $data['password'],
                'email' => $data['email'] ?? null,
                'display_name' => $data['display_name'] ?? null,
            ]);

            if (! empty($data['roles'])) {
                $user->roles()->sync(
                    Role::where('scope', $data['scope'])->whereIn('name', $data['roles'])->pluck('id')
                );
            }

            $events->record('Identity.UserRegistered', [
                'user_id' => $user->id,
                'scope' => $user->scope,
                'username' => $user->username,
                'roles' => $user->roleNames(),
                'source' => 'admin',
            ], $user->tenantId());

            return $user;
        });

        return response()->json(['data' => $user->load('roles')], 201);
    }

    public function show(Request $request, User $user): JsonResponse
    {
        if (! $request->user()->canAccessScope($user->scope)) {
            return $this->scopeForbidden();
        }

        return response()->json(['data' => $user->load('roles')]);
    }

    public function update(Request $request, User $user, DomainEventRecorder $events): JsonResponse
    {
        if (! $request->user()->canAccessScope($user->scope)) {
            return $this->scopeForbidden();
        }

        $data = $request->validate([
            'email' => ['nullable', 'email'],
            'display_name' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:8'],
            'status' => ['nullable', Rule::in([User::STATUS_ACTIVE, User::STATUS_DISABLED])],
        ]);

        $user = DB::transaction(function () use ($user, $data, $events) {
            $wasDisabled = $user->status === User::STATUS_DISABLED;
            $user->update(array_filter($data, fn ($v) => $v !== null));

            $nowDisabled = $user->status === User::STATUS_DISABLED;
            if ($nowDisabled && ! $wasDisabled) {
                $events->record('Identity.UserDisabled', [
                    'user_id' => $user->id,
                    'scope' => $user->scope,
                ], $user->tenantId());
            }

            return $user;
        });

        return response()->json(['data' => $user->load('roles')]);
    }

    public function assignRoles(Request $request, User $user, DomainEventRecorder $events): JsonResponse
    {
        if (! $request->user()->canAccessScope($user->scope)) {
            return $this->scopeForbidden();
        }

        $data = $request->validate([
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['string'],
        ]);

        $user = DB::transaction(function () use ($user, $data, $events) {
            $user->roles()->sync(
                Role::where('scope', $user->scope)->whereIn('name', $data['roles'])->pluck('id')
            );

            $events->record('Identity.RoleAssigned', [
                'user_id' => $user->id,
                'scope' => $user->scope,
                'roles' => $user->roleNames(),
            ], $user->tenantId());

            return $user;
        });

        return response()->json(['data' => $user->load('roles')]);
    }

    private function scopeForbidden(): JsonResponse
    {
        return response()->json([
            'error' => 'forbidden',
            'message' => 'Token is not authorized for this scope',
        ], 403);
    }
}
