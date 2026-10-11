<?php

namespace App\Services;

use App\Models\OutboxEvent;
use App\Support\Uuid7;
use Illuminate\Support\Facades\Request;

/**
 * Records domain events to the outbox in the same transaction as the state
 * change (EVENT_DELIVERY.MD). `outbox:publish` relays them to RabbitMQ —
 * nothing writes to the broker inside the request cycle.
 */
class DomainEventRecorder
{
    public const SERVICE_NAME = 'serviq-billing-backend';

    public function record(string $type, array $payload, ?string $tenantId = null): OutboxEvent
    {
        return OutboxEvent::create([
            'id' => Uuid7::new(),
            'type' => $type,
            'payload' => $payload,
            'occurred_at' => now(),
            'tenant_id' => $tenantId,
            'actor_service' => self::SERVICE_NAME,
            'on_behalf_of' => $this->actorId(),
            'published_at' => null,
        ]);
    }

    private function actorId(): ?string
    {
        $claims = Request::instance()->attributes->get('jwt');

        return $claims['sub'] ?? null;
    }
}
