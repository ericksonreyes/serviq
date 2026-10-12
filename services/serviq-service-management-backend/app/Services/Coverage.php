<?php

namespace App\Services;

use App\Models\Location;
use App\Models\ServiceArea;

/**
 * Coverage gate — the authoritative "does this provider serve this
 * location" decision. Storage is coarse (any admin level); the check
 * expands at query time by walking the submitted location's ancestor
 * chain. Nearest explicit answer wins: walking self → root, the first
 * node appearing in either covered or excluded set decides.
 */
class Coverage
{
    /** Tenant's aggregated coverage spec across all service areas. */
    private function specFor(string $tenant): array
    {
        $covered = $excluded = [];
        $nationwide = $configured = false;

        foreach (ServiceArea::where('tenant_id', $tenant)->get(['id', 'geo']) as $area) {
            $geo = $area->geo ?? [];
            $nationwide = $nationwide || ($geo['countrywide'] ?? false);
            foreach ($geo['admin_areas'] ?? [] as $c) { $covered[$c] = $area->id; $configured = true; }
            foreach ($geo['exclusions'] ?? [] as $c) { $excluded[$c] = $area->id; $configured = true; }
        }

        return compact('covered', 'excluded', 'nationwide', 'configured');
    }

    /** Enforcement binds once the tenant has declared any coverage. */
    public function isConfigured(string $tenant): bool
    {
        return $this->specFor($tenant)['configured'];
    }

    /**
     * @return array{covered: bool, reason: string, matched_area_id?: string, matched_location?: string}
     */
    public function check(string $tenant, string $code): array
    {
        ['covered' => $covered, 'excluded' => $excluded, 'nationwide' => $nationwide, 'configured' => $configured] = $this->specFor($tenant);

        if ($nationwide) {
            return ['covered' => true, 'reason' => 'countrywide'];
        }
        // Nothing declared yet — enforcement only binds once the tenant
        // documents coverage. Open by default keeps the door open for
        // providers still setting up (and for unsupported countries).
        if (! $configured) {
            return ['covered' => true, 'reason' => 'unrestricted'];
        }

        foreach (Location::ancestorCodes($code) as $node) {
            if (isset($excluded[$node])) {
                return ['covered' => false, 'reason' => 'excluded', 'matched_area_id' => $excluded[$node], 'matched_location' => $node,
                    'covered_names' => $this->coveredNames(array_keys($covered))];
            }
            if (isset($covered[$node])) {
                return ['covered' => true, 'reason' => 'within', 'matched_area_id' => $covered[$node], 'matched_location' => $node];
            }
        }

        return ['covered' => false, 'reason' => 'outside', 'covered_names' => $this->coveredNames(array_keys($covered))];
    }

    /**
     * Human-readable coverage for "sorry, here's where we do serve" —
     * dedupes nodes already inside a broader covered node (covering NCR
     * doesn't need Marikina listed too).
     */
    private function coveredNames(array $codes): array
    {
        $topLevel = array_values(array_filter($codes, function ($code) use ($codes) {
            $ancestors = Location::ancestorCodes($code);
            array_shift($ancestors); // drop self
            return ! array_intersect($ancestors, $codes);
        }));

        return Location::whereIn('code', $topLevel)->orderBy('name')->pluck('name')->all();
    }
}
