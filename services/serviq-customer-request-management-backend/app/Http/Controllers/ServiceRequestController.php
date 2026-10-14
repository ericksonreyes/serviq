<?php

namespace App\Http\Controllers;

use App\Models\CustomerAddress;
use App\Models\ServiceRequest;
use App\Services\AvailabilityGate;
use App\Services\CoverageGate;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ServiceRequestController
{
    public function index(Request $request, string $tenant): JsonResponse
    {
        $requests = ServiceRequest::with('customer')
            ->where('tenant_id', $tenant)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->latest()
            ->paginate(50);

        return response()->json($requests);
    }

    public function store(Request $request, DomainEventRecorder $events, CoverageGate $coverage, AvailabilityGate $availability): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['required', 'uuid'],
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'service_id' => ['nullable', 'uuid'],
            'preferred_date' => ['nullable', 'date'],
            'scheduled_for' => ['nullable', 'date'],
            'address_id' => ['nullable', 'uuid', 'exists:customer_addresses,id'],
            'address' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
            'details' => ['nullable', 'array'],
        ]);

        // Coverage gate (ADR-0023): the booking address's admin code is
        // checked against the tenant's declared service areas before the
        // request exists. Resolved from the inline address or the saved
        // address book entry; missing codes reject only when the tenant
        // has actually configured coverage (unverifiable ≠ uncovered).
        $adminCode = $data['address']['admin_code']
            ?? CustomerAddress::find($data['address_id'] ?? '')?->address['admin_code']
            ?? null;

        $verdict = $coverage->check($data['tenant_id'], $adminCode, $request->bearerToken());
        if (! ($verdict['covered'] ?? false)) {
            return match ($verdict['reason'] ?? 'outside') {
                'unavailable' => response()->json([
                    'error' => 'coverage_unavailable',
                    'message' => 'Service-area verification is temporarily unavailable — try again shortly.',
                ], 503),
                'unverifiable' => response()->json([
                    'error' => 'address_unverifiable',
                    'message' => 'We could not verify that address against the service coverage — please pick your city and barangay again.',
                ], 422),
                default => response()->json([
                    'error' => 'outside_coverage',
                    'message' => 'That address is outside the provider\'s service area.',
                    'covered_names' => $verdict['covered_names'] ?? [],
                ], 422),
            };
        }

        // Availability gate: the portal gates its pickers on the same
        // probe, but a direct API call could book a closure or off-shift
        // start — re-check the schedule server-side (fail-closed, like
        // coverage). Only runs when the request carries a catalog
        // service + a date; open-ended requests have nothing to check.
        $when = $data['scheduled_for'] ?? $data['preferred_date'] ?? null;
        if ($when !== null && ! empty($data['service_id'])) {
            $date = substr((string) $when, 0, 10);
            $time = strlen((string) $when) >= 16 ? substr((string) $when, 11, 5) : null;
            $slot = $availability->check($data['tenant_id'], $data['service_id'], $date, $time, $request->bearerToken());
            if (! ($slot['bookable'] ?? false)) {
                return match ($slot['reason'] ?? 'unavailable') {
                    'unavailable' => response()->json([
                        'error' => 'availability_unavailable',
                        'message' => 'Availability verification is temporarily unavailable — try again shortly.',
                    ], 503),
                    default => response()->json([
                        'error' => 'outside_availability',
                        'message' => 'That schedule is outside the provider\'s bookable hours — pick another date or time.',
                        'bookable_times' => $slot['times'] ?? [],
                    ], 422),
                };
            }
        }

        // Free-form booking input folds into details — the address book
        // entry stays a first-class `address_id` reference. The resolved
        // admin code rides along for later dispatch/area matching.
        $data['details'] = array_filter([
            'admin_code' => $adminCode,
            ...($data['details'] ?? []),
            'address' => $data['address'] ?? null,
            'notes' => $data['notes'] ?? null,
        ], fn ($v) => $v !== null);
        unset($data['address'], $data['notes']);

        $serviceRequest = DB::transaction(function () use ($data, $events) {
            $serviceRequest = ServiceRequest::create($data + ['status' => ServiceRequest::SUBMITTED]);

            // The first real domain event on the bus (BUILD_SEQUENCE 1.4).
            $events->record('Request.Submitted', [
                'request_id' => $serviceRequest->id,
                'customer_id' => $serviceRequest->customer_id,
                'service_id' => $serviceRequest->service_id,
                'preferred_date' => $serviceRequest->preferred_date?->toDateString(),
                'scheduled_for' => $serviceRequest->scheduled_for?->toIso8601String(),
                'address_id' => $serviceRequest->address_id,
                'details' => $serviceRequest->details,
            ], $serviceRequest->tenant_id);

            return $serviceRequest;
        });

        return response()->json(['data' => $serviceRequest->load('customer')], 201);
    }

    public function show(string $tenant, ServiceRequest $serviceRequest): JsonResponse
    {
        abort_unless($serviceRequest->tenant_id === $tenant, 404);

        return response()->json(['data' => $serviceRequest->load('customer')]);
    }

    public function cancel(string $tenant, ServiceRequest $serviceRequest, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($serviceRequest->tenant_id === $tenant, 404);
        if ($serviceRequest->status === ServiceRequest::CONVERTED) {
            return response()->json(['error' => 'illegal_transition', 'message' => 'Converted requests cannot be cancelled'], 409);
        }

        $serviceRequest->update(['status' => ServiceRequest::CANCELLED]);
        $events->record('Request.Cancelled', ['request_id' => $serviceRequest->id], $serviceRequest->tenant_id);

        return response()->json(['data' => $serviceRequest]);
    }

    /**
     * Post-completion review — the customer rates a converted request;
     * the result rides on the request's `feedback` payload.
     */
    public function feedback(Request $request, string $tenant, ServiceRequest $serviceRequest, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($serviceRequest->tenant_id === $tenant, 404);
        if ($serviceRequest->status !== ServiceRequest::CONVERTED) {
            return response()->json(['error' => 'illegal_transition', 'message' => 'Feedback is accepted once the request has become a job'], 409);
        }

        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        $serviceRequest->update(['feedback' => $data + ['submitted_at' => now()->toIso8601String()]]);
        $events->record('Request.FeedbackSubmitted', [
            'request_id' => $serviceRequest->id,
            'customer_id' => $serviceRequest->customer_id,
            'rating' => $data['rating'],
        ], $serviceRequest->tenant_id);

        return response()->json(['data' => $serviceRequest]);
    }

    /**
     * Mark the request as handed off to Job Management — the consuming
     * service owns creating the actual Service Job.
     */
    public function convert(string $tenant, ServiceRequest $serviceRequest, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($serviceRequest->tenant_id === $tenant, 404);

        return DB::transaction(function () use ($serviceRequest, $events) {
            // Lock before the status check — two concurrent converts would
            // otherwise both read `submitted`, both pass, and both emit
            // Request.Converted: Job Management would spawn two jobs.
            $locked = ServiceRequest::where('id', $serviceRequest->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== ServiceRequest::SUBMITTED && $locked->status !== ServiceRequest::REVIEWED) {
                return response()->json(['error' => 'illegal_transition', 'message' => "Cannot convert a {$locked->status} request"], 409);
            }

            $locked->update(['status' => ServiceRequest::CONVERTED]);
            $events->record('Request.Converted', [
                'request_id' => $locked->id,
                'customer_id' => $locked->customer_id,
                'service_id' => $locked->service_id,
                'details' => $locked->details,
            ], $locked->tenant_id);

            return response()->json(['data' => $locked]);
        });
    }
}
