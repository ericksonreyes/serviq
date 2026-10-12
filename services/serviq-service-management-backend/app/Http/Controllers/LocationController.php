<?php

namespace App\Http\Controllers;

use App\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Administrative hierarchy reference — global data (not tenant-scoped),
 * so these routes sit under jwt.auth only. Powers the coverage smart
 * input and the booking address cascades.
 */
class LocationController
{
    /** Top-level units (regions) — the browse-mode entry point. */
    public function roots(Request $request): JsonResponse
    {
        $country = $request->query('country', 'PH');
        $roots = Location::where('country', $country)->whereNull('parent_code')->orderBy('name')->get();

        return response()->json(['data' => $roots->map(fn ($l) => $this->present($l, false))]);
    }

    /**
     * Name search for the smart input — deterministic matching (ranked
     * exact → prefix → contains), no model. Scope words are the
     * client's concern; this endpoint resolves place names to codes.
     */
    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (strlen($q) < 2) return response()->json(['data' => []]);

        $levels = array_filter(explode(',', (string) $request->query('level', '')));
        $country = $request->query('country', 'PH');
        $like = '%'.str_replace(['%', '_'], '', mb_strtolower($q)).'%';

        $hits = Location::where('country', $country)
            ->when($levels, fn ($query) => $query->whereIn('level', $levels))
            ->whereRaw('lower(name) like ?', [$like])
            ->limit(200)
            ->get();

        $lower = mb_strtolower($q);
        $ranked = $hits->sortByDesc(function ($l) use ($lower) {
            $n = mb_strtolower($l->name);
            if ($n === $lower) return 4;
            if (str_starts_with($n, $lower)) return 3;
            if (preg_match('/\b'.preg_quote($lower, '/').'/', $n)) return 2;
            return 1;
        })->take(10)->values();

        return response()->json(['data' => $ranked->map(fn ($l) => $this->present($l))]);
    }

    /** Direct children — the cascading picker walks one level at a time. */
    public function children(string $code): JsonResponse
    {
        $node = Location::find($code);
        abort_unless($node, 404);
        $children = $node->newQuery()->where('parent_code', $code)->orderBy('name')->get();

        return response()->json([
            'data' => $children->map(fn ($l) => $this->present($l, false)),
            'meta' => ['parent' => $this->present($node)],
        ]);
    }

    public function show(string $code): JsonResponse
    {
        $node = Location::find($code);
        abort_unless($node, 404);

        return response()->json(['data' => $this->present($node)]);
    }

    private function present(Location $location, bool $withPath = true): array
    {
        return [
            'code' => $location->code,
            'name' => $location->name,
            'level' => $location->level,
            'parent_code' => $location->parent_code,
            ...( $withPath ? [
                'path' => $location->path(),
                // Ancestor codes (self → root) let clients dedupe coverage
                // chips without a second round-trip.
                'ancestors' => Location::ancestorCodes($location->code),
            ] : [] ),
        ];
    }
}
