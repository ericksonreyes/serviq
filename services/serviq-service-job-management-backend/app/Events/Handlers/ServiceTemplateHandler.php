<?php

namespace App\Events\Handlers;

use App\Models\ServiceTemplate;
use Illuminate\Support\Facades\Log;

/**
 * ServiceManagement.ServiceCreated / WorkflowTemplateChanged → maintain the
 * local service-template projection (event-carried state transfer).
 */
class ServiceTemplateHandler
{
    public function handle(array $envelope): void
    {
        $payload = $envelope['payload'] ?? [];
        $serviceId = $payload['service_id'] ?? null;
        if ($serviceId === null) {
            throw new \RuntimeException($envelope['type'].' missing service_id');
        }

        ServiceTemplate::updateOrCreate(
            ['service_id' => $serviceId],
            [
                'tenant_id' => $envelope['tenant_id'],
                'name' => $payload['name'] ?? 'service',
                'steps' => $payload['steps'] ?? [],
            ],
        );

        Log::info("Service template projected: {$serviceId}");
    }
}
