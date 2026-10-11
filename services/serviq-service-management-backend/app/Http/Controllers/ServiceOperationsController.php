<?php

namespace App\Http\Controllers;

use App\Models\CatalogService;
use App\Models\TenantSetting;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * Per-service operations surface: bookable availability and pricing config.
 */
class ServiceOperationsController
{
    // Used when the tenant hasn't configured operating_hours — field-service
    // default: Mon–Sat 08:00–17:00, Sunday closed.
    private const DEFAULT_HOURS = [
        'monday' => ['open' => '08:00', 'close' => '17:00'],
        'tuesday' => ['open' => '08:00', 'close' => '17:00'],
        'wednesday' => ['open' => '08:00', 'close' => '17:00'],
        'thursday' => ['open' => '08:00', 'close' => '17:00'],
        'friday' => ['open' => '08:00', 'close' => '17:00'],
        'saturday' => ['open' => '08:00', 'close' => '17:00'],
        'sunday' => null,
    ];

    private const MAX_RANGE_DAYS = 92;

    /**
     * Bookable capacity per date, derived from the tenant's operating-hours
     * settings and the service's estimated_minutes — crews × slots/day.
     * Config-derived, not booked-net: netting against live jobs belongs to
     * Job Management's schedule projection, not a cross-context read.
     */
    public function availability(Request $request, string $tenant, CatalogService $service): JsonResponse
    {
        abort_unless($service->tenant_id === $tenant, 404);

        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $from = Carbon::createFromFormat('Y-m-d', $data['from'])->startOfDay();
        $to = Carbon::createFromFormat('Y-m-d', $data['to'])->startOfDay();
        abort_if($from->diffInDays($to) > self::MAX_RANGE_DAYS, 422, 'Range too large');

        $settings = TenantSetting::where('tenant_id', $tenant)->value('settings') ?? [];
        $hours = $settings['operating_hours'] ?? self::DEFAULT_HOURS;
        $crews = max(1, (int) ($settings['crews'] ?? 1));
        $minutesPerJob = max(1, (int) ($service->estimated_minutes ?? 60));

        $days = [];
        for ($date = $from->copy(); $date->lte($to); $date->addDay()) {
            $window = $hours[strtolower($date->format('l'))] ?? null;
            if (! is_array($window) || empty($window['open']) || empty($window['close'])) {
                continue;
            }
            [$oh, $om] = array_map('intval', array_pad(explode(':', (string) $window['open']), 2, 0));
            [$ch, $cm] = array_map('intval', array_pad(explode(':', (string) $window['close']), 2, 0));
            $workMinutes = ($ch * 60 + $cm) - ($oh * 60 + $om);
            if ($workMinutes <= 0) {
                continue;
            }
            $slots = intdiv($workMinutes, $minutesPerJob) * $crews;
            if ($slots > 0) {
                $days[] = ['date' => $date->toDateString(), 'slots' => $slots];
            }
        }

        return response()->json(['data' => $days]);
    }

    public function showPricing(string $tenant, CatalogService $service): JsonResponse
    {
        abort_unless($service->tenant_id === $tenant, 404);

        return response()->json(['data' => $this->pricing($service)]);
    }

    public function updatePricing(Request $request, string $tenant, CatalogService $service, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($service->tenant_id === $tenant, 404);

        $data = $request->validate([
            'base_price_cents' => ['sometimes', 'integer', 'min:0'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'price_type' => ['sometimes', Rule::in(['flat', 'hourly', 'quote'])],
        ]);

        $service->update([
            'price_cents' => $data['base_price_cents'] ?? $service->price_cents,
            'currency' => $data['currency'] ?? $service->currency,
            'price_type' => $data['price_type'] ?? $service->price_type,
        ]);

        $events->record('ServiceManagement.ServicePricingUpdated', [
            'service_id' => $service->id,
            'base_price_cents' => $service->price_cents,
            'currency' => $service->currency,
            'price_type' => $service->price_type,
        ], $tenant);

        return response()->json(['data' => $this->pricing($service->fresh())]);
    }

    private function pricing(CatalogService $service): array
    {
        return [
            'service_id' => $service->id,
            'base_price_cents' => $service->price_cents,
            'currency' => $service->currency,
            'price_type' => $service->price_type,
        ];
    }
}
