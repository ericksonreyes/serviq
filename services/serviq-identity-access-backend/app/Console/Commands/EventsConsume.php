<?php

namespace App\Console\Commands;

use App\Events\Handlers\TenantCreatedHandler;
use App\Models\ProcessedEvent;
use App\Services\Messaging\RabbitMq;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Dedicated event consumer — runs in its own container, never in the API
 * process (EVENT_DELIVERY.MD). Handlers are idempotent: every delivery is
 * deduped on the envelope `id` via processed_events before handling.
 */
class EventsConsume extends Command
{
    protected $signature = 'events:consume';

    protected $description = 'Consume domain events from serviq.events';

    /** Event-type routing: Platform.* is bound; handlers keyed by type. */
    private const BINDINGS = ['Platform.*'];

    private const HANDLERS = [
        'Platform.TenantCreated' => TenantCreatedHandler::class,
    ];

    public function handle(RabbitMq $mq): int
    {
        $connection = $mq->connection();
        $channel = $connection->channel();
        $mq->declareExchange($channel);
        $queue = $mq->declareQueue($channel, self::BINDINGS);

        $this->info("Consuming {$queue} on ".$mq->exchange());

        $channel->basic_consume($queue, '', false, false, false, false, function ($message) use ($channel) {
            $envelope = json_decode($message->getBody(), true);
            $eventId = $envelope['id'] ?? null;
            $type = $envelope['type'] ?? 'unknown';

            try {
                if ($eventId === null) {
                    throw new \RuntimeException('Envelope missing id');
                }

                // Idempotency: first step of every handler is dedupe.
                $handled = DB::transaction(function () use ($envelope, $eventId, $type) {
                    if (ProcessedEvent::where('event_id', $eventId)->exists()) {
                        return false;
                    }

                    $handler = self::HANDLERS[$type] ?? null;
                    if ($handler !== null) {
                        app($handler)->handle($envelope);
                    }

                    ProcessedEvent::create(['event_id' => $eventId, 'processed_at' => now()]);

                    return true;
                });

                $channel->basic_ack($message->getDeliveryTag());
                if (! $handled) {
                    Log::info("Duplicate delivery skipped: {$type} {$eventId}");
                }
            } catch (Throwable $e) {
                // NACK without requeue → broker dead-letters after retries.
                $channel->basic_nack($message->getDeliveryTag(), false, false);
                Log::error("Event handling failed: {$type} {$eventId} — {$e->getMessage()}");
            }
        });

        while ($channel->is_consuming()) {
            $channel->wait();
        }

        return self::SUCCESS;
    }
}
