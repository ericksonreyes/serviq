<?php

namespace App\Http\Controllers;

use App\Models\ServiceRequest;
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

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
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

        // Free-form booking input folds into details — the address book
        // entry stays a first-class `address_id` reference.
        $data['details'] = array_filter([
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
        if ($serviceRequest->status !== ServiceRequest::SUBMITTED && $serviceRequest->status !== ServiceRequest::REVIEWED) {
            return response()->json(['error' => 'illegal_transition', 'message' => "Cannot convert a {$serviceRequest->status} request"], 409);
        }

        $serviceRequest->update(['status' => ServiceRequest::CONVERTED]);
        $events->record('Request.Converted', [
            'request_id' => $serviceRequest->id,
            'customer_id' => $serviceRequest->customer_id,
            'service_id' => $serviceRequest->service_id,
            'details' => $serviceRequest->details,
        ], $serviceRequest->tenant_id);

        return response()->json(['data' => $serviceRequest]);
    }
}
