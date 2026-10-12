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
        return response()->json(Customer::where('tenant_id', $tenant)->orderBy('name')->paginate(50));
    }

    public function store(Request $request, DomainEventRecorder $events): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['required', 'uuid'],
            'user_id' => ['nullable', 'uuid'],
            'name' => ['required', 'string', 'max:255'],
            'contact' => ['nullable', 'array'],
            'address' => ['nullable', 'array'],
        ]);

        $customer = Customer::create($data);
        $events->record('Customer.Created', ['customer_id' => $customer->id, 'name' => $customer->name], $customer->tenant_id);

        return response()->json(['data' => $customer], 201);
    }

    /** Resolves the caller's CRM record from their IAM `sub`. */
    public function byUser(string $tenant, string $user): JsonResponse
    {
        $customer = Customer::where('tenant_id', $tenant)->where('user_id', $user)->first();
        abort_if($customer === null, 404, 'No customer record for this user');

        return response()->json(['data' => $customer]);
    }

    public function show(string $tenant, Customer $customer): JsonResponse
    {
        abort_unless($customer->tenant_id === $tenant, 404);

        return response()->json(['data' => $customer->load('addresses')]);
    }

    public function update(Request $request, string $tenant, Customer $customer, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($customer->tenant_id === $tenant, 404);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'contact' => ['sometimes', 'nullable', 'array'],
            'address' => ['sometimes', 'nullable', 'array'],
        ]);

        $customer->update($data);
        $events->record('Customer.Updated', ['customer_id' => $customer->id], $customer->tenant_id);

        return response()->json(['data' => $customer->fresh()->load('addresses')]);
    }
}
