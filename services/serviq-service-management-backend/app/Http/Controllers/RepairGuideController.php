<?php

namespace App\Http\Controllers;

use App\Models\RepairGuide;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Curated repair/troubleshooting guides — read by customer and dispatcher
 * surfaces, written by tenant staff (admin, dispatcher, support roles).
 */
class RepairGuideController
{
    private const STAFF_ROLES = ['Tenant Administrator', 'Dispatcher', 'Customer Support'];

    public function index(Request $request, string $tenant): JsonResponse
    {
        $guides = RepairGuide::where('tenant_id', $tenant)
            ->when($request->query('q'), function ($q, $term) {
                $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $term).'%';
                $q->where(fn ($w) => $w->where('title', 'ilike', $like)
                    ->orWhere('body', 'ilike', $like)
                    ->orWhereRaw('tags::text ilike ?', [$like]));
            })
            ->orderBy('title')
            ->get();

        return response()->json(['data' => $guides]);
    }

    public function store(Request $request, string $tenant): JsonResponse
    {
        $identity = $request->user();
        if (! $identity->isPlatform() && array_intersect(self::STAFF_ROLES, $identity->roles()) === []) {
            return response()->json(['error' => 'forbidden', 'message' => 'Staff role required'], 403);
        }

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:50'],
        ]);

        $guide = RepairGuide::create($data + [
            'tenant_id' => $tenant,
            'created_by' => $request->attributes->get('jwt')['sub'] ?? null,
        ]);

        return response()->json(['data' => $guide], 201);
    }
}
