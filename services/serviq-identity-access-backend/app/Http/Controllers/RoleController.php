<?php

namespace App\Http\Controllers;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RoleController
{
    public function index(Request $request): JsonResponse
    {
        $caller = $request->user();
        $scope = $request->query('scope') ?? ($caller->isPlatform() ? null : $caller->tenantId());
        if ($scope !== null && ! $caller->canAccessScope($scope)) {
            return $this->scopeForbidden();
        }

        $roles = Role::with('permissions')
            ->when($scope, fn ($q) => $q->where('scope', $scope))
            ->orderBy('scope')->orderBy('name')
            ->get();

        return response()->json(['data' => $roles]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'scope' => ['required', 'string'],
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')],
        ]);

        if (! $request->user()->canAccessScope($data['scope'])) {
            return $this->scopeForbidden();
        }

        $role = Role::create([
            'scope' => $data['scope'],
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
        ]);

        if (! empty($data['permissions'])) {
            $role->permissions()->sync(
                Permission::whereIn('name', $data['permissions'])->pluck('id')
            );
        }

        return response()->json(['data' => $role->load('permissions')], 201);
    }

    public function grantPermissions(Request $request, Role $role): JsonResponse
    {
        if (! $request->user()->canAccessScope($role->scope)) {
            return $this->scopeForbidden();
        }

        $data = $request->validate([
            'permissions' => ['required', 'array', 'min:1'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')],
        ]);

        $role->permissions()->syncWithoutDetaching(
            Permission::whereIn('name', $data['permissions'])->pluck('id')
        );

        return response()->json(['data' => $role->load('permissions')]);
    }

    private function scopeForbidden(): JsonResponse
    {
        return response()->json([
            'error' => 'forbidden',
            'message' => 'Token is not authorized for this scope',
        ], 403);
    }
}
