<?php

namespace App\Http\Controllers;

use App\Models\RepairGuide;
use App\Services\Embeddings\TextEmbedder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Curated repair/troubleshooting guides — read by customer and dispatcher
 * surfaces, written by tenant staff (admin, dispatcher, support roles).
 * Search is semantic when pgvector + a live provider are available
 * (ADR-0013), keyword-matched otherwise.
 */
class RepairGuideController
{
    private const STAFF_ROLES = ['Tenant Administrator', 'Dispatcher', 'Customer Support'];

    public function index(Request $request, string $tenant): JsonResponse
    {
        $term = $request->query('q');
        $guides = RepairGuide::where('tenant_id', $tenant);

        // Semantic ordering — cosine distance over pgvector. Guides without
        // an embedding (pre-feature rows, provider down at write) sort last.
        $vector = $term ? app(TextEmbedder::class)->embed($term) : null;
        if ($vector !== null && DB::getDriverName() === 'pgsql') {
            return response()->json([
                'data' => $guides
                    ->orderByRaw('embedding <-> ?::vector ASC NULLS LAST', [self::vectorLiteral($vector)])
                    ->orderBy('title')
                    ->get(),
            ]);
        }

        $guides->when($term, function ($q, $term) {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $term).'%';
            if (DB::getDriverName() === 'pgsql') {
                $q->where(fn ($w) => $w->where('title', 'ilike', $like)
                    ->orWhere('body', 'ilike', $like)
                    ->orWhereRaw('tags::text ilike ?', [$like]));
            } else {
                $q->where(fn ($w) => $w->where('title', 'like', $like)
                    ->orWhere('body', 'like', $like)
                    ->orWhere('tags', 'like', $like));
            }
        });

        return response()->json(['data' => $guides->orderBy('title')->get()]);
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

        $vec = app(TextEmbedder::class)->embed($data['title']."\n".$data['body']);
        if ($vec !== null) {
            $data['embedding'] = self::vectorLiteral($vec);
        }

        $guide = RepairGuide::create($data + [
            'tenant_id' => $tenant,
            'created_by' => $request->attributes->get('jwt')['sub'] ?? null,
        ]);

        return response()->json(['data' => $guide], 201);
    }

    private static function vectorLiteral(array $vec): string
    {
        return '['.implode(',', array_map(fn ($x) => (float) $x, $vec)).']';
    }
}
