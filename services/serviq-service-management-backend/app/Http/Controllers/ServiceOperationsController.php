<?php

namespace App\Http\Controllers;

use App\Models\CatalogService;
use App\Models\ProjectedAgentAvailability;
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
     * Bookable capacity per date, factoring the tenant's operating
     * hours/days, declared holidays and non-working days, and projected
     * crew schedules (Workforce events). Config- and projection-derived,
     * not booked-net: netting against live jobs belongs to Job
     * Management's schedule projection, not a cross-context read.
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

        // Provider-declared closures — recurring holidays as MM-DD,
        // one-off non-working days as Y-m-d.
        $holidays = collect($settings['holidays'] ?? []);
        $nonWorkingDays = collect($settings['non_working_days'] ?? []);

        // Projected crew schedules (Workforce events). Fall back to the
        // blunt `crews` setting only when the tenant has NO projection at
        // all (fresh signup, no events yet) — a projection containing only
        // inactive agents means "nobody works", not "use crews".
        $useAgents = ProjectedAgentAvailability::where('tenant_id', $tenant)->exists();
        $agentRows = ProjectedAgentAvailability::where('tenant_id', $tenant)
            ->where('status', 'active')
            ->get()
            ->groupBy('day_of_week');

        $toMinutes = fn (string $t) => ((int) explode(':', $t)[0]) * 60 + ((int) explode(':', $t)[1] ?? 0);
        $toTime = fn (int $m) => sprintf('%02d:%02d', intdiv($m, 60), $m % 60);

        $days = [];
        for ($date = $from->copy(); $date->lte($to); $date->addDay()) {
            if ($nonWorkingDays->contains($date->toDateString())
                || $holidays->contains($date->format('m-d'))) {
                continue;
            }
            $window = $hours[strtolower($date->format('l'))] ?? null;
            if (! is_array($window) || empty($window['open']) || empty($window['close'])) {
                continue;
            }
            $open = $toMinutes((string) $window['open']);
            $close = $toMinutes((string) $window['close']);
            if ($close - $open <= 0) {
                continue;
            }

            if ($useAgents) {
                // Capacity = sum over agents of their overlap with the
                // business window, in whole jobs × concurrent capacity.
                $agents = $agentRows[$date->dayOfWeek] ?? collect();
                $slots = 0;
                foreach ($agents as $a) {
                    $overlapStart = max($open, $toMinutes((string) $a->start_time));
                    $overlapEnd = min($close, $toMinutes((string) $a->end_time));
                    if ($overlapEnd - $overlapStart > 0) {
                        $slots += intdiv($overlapEnd - $overlapStart, $minutesPerJob)
                            * max(1, (int) $a->capacity);
                    }
                }
                $fitsShift = fn (int $t) => $agents->contains(fn ($a) =>
                    $toMinutes((string) $a->start_time) <= $t
                    && $toMinutes((string) $a->end_time) >= $t + $minutesPerJob);
            } else {
                $slots = intdiv($close - $open, $minutesPerJob) * $crews;
                $fitsShift = fn (int $t) => true;
            }

            // Candidate starts on the hour from open: `hours` carries every
            // start inside the window with a coverage flag (a start is only
            // bookable when the whole job fits inside an agent's shift AND
            // the business window); `times` is the bookable subset at the
            // job's natural cadence. close may reach 24:00 for 24/7
            // operations (overnight windows spanning midnight are not
            // representable — providers set 00:00–24:00 instead).
            $hourOptions = [];
            $times = [];
            for ($t = $open; $t < $close; $t += 60) {
                $available = $t + $minutesPerJob <= $close && $fitsShift($t);
                $hourOptions[] = ['time' => $toTime($t), 'available' => $available];
            }
            for ($t = $open; $t + $minutesPerJob <= $close; $t += $minutesPerJob) {
                if ($t + $minutesPerJob <= $close && $fitsShift($t)) {
                    $times[] = $toTime($t);
                }
            }

            if ($slots > 0) {
                $days[] = [
                    'date' => $date->toDateString(),
                    'slots' => $slots,
                    // Operating window + pre-computed candidate starts —
                    // clients render `hours`/`times` as-is when present.
                    'open' => (string) $window['open'],
                    'close' => (string) $window['close'],
                    'job_minutes' => $minutesPerJob,
                    'hours' => $hourOptions,
                    'times' => $times,
                ];
            }
        }

        return response()->json(['data' => $days]);
    }

    /**
     * Customer-facing business info: the weekly operating window and
     * upcoming closures, so a picker can show "closed" with a reason
     * instead of an unexplained disabled date. Deliberately omits
     * capacity internals (crews, agent shifts, flags) — those are
     * provider-side concerns; customers see the effect, not the roster.
     */
    public function summary(string $tenant): JsonResponse
    {
        $settings = TenantSetting::where('tenant_id', $tenant)->value('settings') ?? [];
        $hours = $settings['operating_hours'] ?? self::DEFAULT_HOURS;
        $today = Carbon::today();
        $horizon = $today->copy()->addDays(self::MAX_RANGE_DAYS);

        // One-off closures as their dates; recurring MM-DD holidays as
        // their next occurrence inside the booking horizon.
        $closures = collect($settings['non_working_days'] ?? [])
            ->filter(fn ($d) => $d >= $today->toDateString())
            ->map(fn ($d) => ['date' => $d, 'kind' => 'closure']);
        foreach ($settings['holidays'] ?? [] as $md) {
            $occurrence = Carbon::createFromFormat('m-d', (string) $md);
            if (! $occurrence) {
                continue;
            }
            $occurrence->setYear($today->year);
            if ($occurrence->lt($today)) {
                $occurrence->addYear();
            }
            if ($occurrence->lte($horizon)) {
                $closures->push(['date' => $occurrence->toDateString(), 'kind' => 'holiday']);
            }
        }

        return response()->json(['data' => [
            'hours' => $hours,
            'closures' => $closures->sortBy('date')->unique('date')->values()->all(),
            'cancellation_policy' => $settings['cancellation_policy'] ?? null,
        ]]);
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
