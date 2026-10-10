<?php

namespace App\Console\Commands;

use App\Models\OutboxEvent;
use App\Services\Messaging\RabbitMq;
use Illuminate\Console\Command;
use Throwable;

/**
 * Outbox relay: polls unpublished outbox rows, publishes them to the
 * `serviq.events` topic exchange, marks them published (EVENT_DELIVERY.MD).
 */
class OutboxPublish extends Command
{
    protected $signature = 'outbox:publish {--once : Drain pending rows and exit} {--sleep=1 : Poll interval in seconds}';

    protected $description = 'Relay unpublished outbox events to RabbitMQ';

    public function handle(RabbitMq $mq): int
    {
        $connection = $mq->connection();
        $channel = $connection->channel();
        $mq->declareExchange($channel);

        $this->info('Outbox relay started — publishing to '.$mq->exchange());

        do {
            OutboxEvent::whereNull('published_at')->orderBy('occurred_at')->limit(100)
                ->each(function (OutboxEvent $event) use ($mq, $channel) {
                    try {
                        $mq->publish($channel, $event->type, [
                            'id' => $event->id,
                            'type' => $event->type,
                            'occurred_at' => $event->occurred_at->toIso8601String(),
                            'tenant_id' => $event->tenant_id,
                            'actor' => [
                                'service' => $event->actor_service,
                                'on_behalf_of' => $event->on_behalf_of,
                            ],
                            'payload' => $event->payload,
                        ]);
                        $event->update(['published_at' => now()]);
                    } catch (Throwable $e) {
                        $this->error("Failed to publish {$event->id}: {$e->getMessage()}");
                    }
                });

            if ($this->option('once')) {
                break;
            }

            sleep((int) $this->option('sleep'));
        } while (true);

        $channel->close();
        $connection->close();

        return self::SUCCESS;
    }
}
