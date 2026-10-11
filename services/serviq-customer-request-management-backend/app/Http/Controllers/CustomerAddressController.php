<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Services\DomainEventRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The customer's address book — labelled saved locations a request can
 * reference via `address_id` (or bypass with an inline address).
 */
class CustomerAddressController
{
    public function index(string $tenant, Customer $customer): JsonResponse
    {
        abort_unless($customer->tenant_id === $tenant, 404);

        return response()->json(['data' => $customer->addresses()->orderByDesc('is_default')->orderBy('label')->get()]);
    }

    public function store(Request $request, string $tenant, Customer $customer, DomainEventRecorder $events): JsonResponse
    {
        abort_unless($customer->tenant_id === $tenant, 404);

        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:100'],
            'address' => ['required', 'array'],
            'is_default' => ['nullable', 'boolean'],
        ]);

        $address = DB::transaction(function () use ($data, $tenant, $customer, $events) {
            if ($data['is_default'] ?? false) {
                $customer->addresses()->update(['is_default' => false]);
            }
            $address = $customer->addresses()->create($data + ['tenant_id' => $tenant]);

            $events->record('Customer.AddressSaved', [
                'customer_id' => $customer->id,
                'address_id' => $address->id,
            ], $tenant);

            return $address;
        });

        return response()->json(['data' => $address], 201);
    }

    public function update(Request $request, string $tenant, Customer $customer, CustomerAddress $address, DomainEventRecorder $events): JsonResponse
    {
        $this->scoped($tenant, $customer, $address);

        $data = $request->validate([
            'label' => ['sometimes', 'nullable', 'string', 'max:100'],
            'address' => ['sometimes', 'array'],
            'is_default' => ['sometimes', 'boolean'],
        ]);

        DB::transaction(function () use ($data, $tenant, $customer, $address, $events) {
            if ($data['is_default'] ?? false) {
                $customer->addresses()->where('id', '!=', $address->id)->update(['is_default' => false]);
            }
            $address->update($data);

            $events->record('Customer.AddressSaved', [
                'customer_id' => $customer->id,
                'address_id' => $address->id,
            ], $tenant);
        });

        return response()->json(['data' => $address->fresh()]);
    }

    public function destroy(string $tenant, Customer $customer, CustomerAddress $address, DomainEventRecorder $events): JsonResponse
    {
        $this->scoped($tenant, $customer, $address);

        DB::transaction(function () use ($tenant, $customer, $address, $events) {
            $address->delete();

            $events->record('Customer.AddressRemoved', [
                'customer_id' => $customer->id,
                'address_id' => $address->id,
            ], $tenant);
        });

        return response()->json(['deleted' => true]);
    }

    private function scoped(string $tenant, Customer $customer, CustomerAddress $address): void
    {
        abort_unless($customer->tenant_id === $tenant && $address->customer_id === $customer->id, 404);
    }
}
