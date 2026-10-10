<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController
{
    public function index(string $tenant): JsonResponse
    {
        return response()->json(['data' => Customer::where('tenant_id', $tenant)->orderBy('name')->paginate(50)]);
    }

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['required', 'uuid'],
            'name' => ['required', 'string', 'max:255'],
            'contact' => ['nullable', 'array'],
            'address' => ['nullable', 'array'],
        ]);

        $customer = Customer::create($data);
        $events->record('Customer.Created', ['customer_id' => $customer->id, 'name' => $customer->name], $customer->tenant_id);

        return response()->json(['data' => $customer], 201);
    }

    public function show(string $tenant, Customer $customer): JsonResponse
    {
        abort_unless($customer->tenant_id === $tenant, 404);

        return response()->json(['data' => $customer]);
    }
}
