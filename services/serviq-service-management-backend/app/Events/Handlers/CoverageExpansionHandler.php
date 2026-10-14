<?php

namespace App\Events\Handlers;

use App\Models\CoverageInterest;
use App\Models\Location;
use App\Models\ServiceArea;
use App\Services\Coverage;
use App\Services\DomainEventRecorder;

/**
 * ServiceManagement.ServiceAreaCreated / ServiceAreaUpdated → notify-on-
 * expansion. For every unmet coverage interest, re-runs the coverage
 * verdict against the tenant's current spec; when the triggering area is
 * the one that newly covers the customer's location (matched_area_id —
 * so a rename or an unrelated area doesn't re-notify), one
 * `CoverageSatisfied` event per interested user goes out addressed to
 * them (`user_id` → their portal notification feed). The interest's
 * `notified_at` marks it fulfilled — it drops off the demand list and
 * won't re-notify on later expansions unless the customer re-subscribes.
 */
class CoverageExpansionHandler
{
    public function __construct(
        private Coverage $coverage,
        private DomainEventRecorder $events,
    ) {}

    public function handle(array $envelope): void
    {
        $tenantId = $envelope['tenant_id'] ?? null;
        $areaId = $envelope['payload']['service_area_id'] ?? null;
        if ($tenantId === null || $areaId === null) {
            throw new \RuntimeException($envelope['type'].' missing tenant_id or service_area_id');
        }

        // Deleted between record and consume → nothing to expand into.
        $area = ServiceArea::find($areaId);
        if ($area === null || $area->tenant_id !== $tenantId) {
            return;
        }

        $spec = $this->coverage->specFor($tenantId);
        $countrywide = (bool) ($area->geo['countrywide'] ?? false);

        CoverageInterest::where('tenant_id', $tenantId)
            ->whereNull('notified_at')
            ->orderBy('created_at')
            ->cursor()
            ->each(function (CoverageInterest $interest) use ($spec, $area, $countrywide, $tenantId) {
                $verdict = $this->coverage->checkSpec($spec, $interest->admin_code);
                if (! ($verdict['covered'] ?? false)) {
                    return;
                }

                // Only the area that caused the flip notifies — otherwise
                // every later area edit would re-tell already-covered users.
                $causedByThisArea = ($verdict['matched_area_id'] ?? null) === $area->id
                    || (($verdict['reason'] ?? null) === 'countrywide' && $countrywide);
                if (! $causedByThisArea) {
                    return;
                }

                $interest->update(['notified_at' => now()]);
                $location = Location::find($interest->admin_code);

                $this->events->record('ServiceManagement.CoverageSatisfied', [
                    'user_id' => $interest->user_id,
                    'admin_code' => $interest->admin_code,
                    'location_name' => $location?->name ?? $interest->admin_code,
                    'location_path' => $location?->path() ?? $interest->admin_code,
                    'service_area_name' => $area->name,
                ], $tenantId);
            });
    }
}
