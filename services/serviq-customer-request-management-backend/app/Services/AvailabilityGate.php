<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Synchronous availability probe against Service Management — the owning
 * context for operating hours, closures, and crew capacity. The customer
 * portal gates its pickers on this endpoint, but the UI is not a
 * security boundary: a direct API call could book a holiday or an
 * off-shift start, so request creation re-checks the schedule here.
 */
class AvailabilityGate
{
    /**
     * Is $date/$time a bookable start for the service? $time may be null
     * (date-only preference) — then only the day must be bookable.
     *
     * @return array{bookable: bool, reason: string, times?: array}
     */
    public function check(string $tenant, string $serviceId, string $date, ?string $time, ?string $bearerToken): array
    {
        $base = rtrim(env('SERVICE_MANAGEMENT_URL', 'http://service-management-backend'), '/');
        $res = Http::withToken($bearerToken ?? '')
            ->timeout(5)
            ->get("{$base}/api/v1/tenants/{$tenant}/services/{$serviceId}/availability", [
                'from' => $date,
                'to' => $date,
            ]);

        if (! $res->ok()) {
            return ['bookable' => false, 'reason' => 'unavailable'];
        }

        // A date absent from `days` is closed, declared non-working, or
        // has zero capacity — all unbookable for the same reason.
        $day = collect($res->json('data') ?? [])->firstWhere('date', $date);
        if (! $day) {
            return ['bookable' => false, 'reason' => 'closed'];
        }
        if ($time === null) {
            return ['bookable' => true, 'reason' => 'bookable'];
        }

        // `times` is the bookable set at the job's natural cadence;
        // `hours` flags every hourly start against the window and agent
        // shifts — the same flags that drive the portal's time chips, so
        // the gate accepts exactly what the UI offers. For a start not on
        // the hour, the containing hour's flag is the shift-coverage
        // proxy plus the job must still end inside the window.
        $toMin = fn (string $t) => (int) explode(':', $t)[0] * 60 + ((int) explode(':', $t)[1] ?? 0);
        $t = $toMin($time);
        $close = $toMin((string) ($day['close'] ?? '00:00'));
        $minutesPerJob = max(1, (int) ($day['job_minutes'] ?? 60));

        $bookable = in_array($time, $day['times'] ?? [], true);
        if (! $bookable && $t + $minutesPerJob <= $close) {
            $startHour = sprintf('%02d:00', intdiv($t, 60));
            $hourEntry = collect($day['hours'] ?? [])->firstWhere('time', $startHour);
            $bookable = $hourEntry === null
                ? $t >= $toMin((string) ($day['open'] ?? '00:00'))
                : ($hourEntry['available'] ?? false);
        }

        return $bookable
            ? ['bookable' => true, 'reason' => 'bookable']
            : [
                'bookable' => false,
                'reason' => 'time_unavailable',
                'times' => $day['times']
                    ?? collect($day['hours'] ?? [])->where('available', true)->pluck('time')->all(),
            ];
    }
}
