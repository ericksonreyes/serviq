<?php

namespace App\Console\Commands;

use App\Models\ProcessedEvent;
use App\Services\Messaging\RabbitMq;
use App\Services\NotificationDispatcher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The pure-consumer: binds the whole topic exchange and turns domain
 * events into stored notifications. First service that proves the bus
 * end-to-end (BUILD_SEQUENCE milestone).
 */
class EventsConsume extends Command
{
    protected $signature = 'events:consume';

    protected $description = 'Consume all domain events into notifications';

    // '#' matches every routing key on the topic exchange.
    private const BINDINGS = ['#'];

    public function handle(RabbitMq $mq, NotificationDispatcher $dispatcher): int
    {
        $connection = $mq->connection();
        $channel = $connection->channel();
        $mq->declareExchange($channel);
        $queue = $mq->declareQueue($channel, self::BINDINGS);

        $this->info("Consuming {$queue} on ".$mq->exchange());

        $channel->basic_consume($queue, '', false, false, false, false, function ($message) use ($channel, $dispatcher) {
            $envelope = json_decode($message->getBody(), true);
            $eventId = $envelope['id'] ?? null;
            $type = $envelope['type'] ?? 'unknown';

            try {
                if ($eventId === null) {
                    throw new \RuntimeException('Envelope missing id');
                }

                $handled = DB::transaction(function () use ($envelope, $eventId, $dispatcher) {
                    if (ProcessedEvent::where('event_id', $eventId)->exists()) {
                        return false;
                    }
                    $dispatcher->dispatch($envelope);
                    ProcessedEvent::create(['event_id' => $eventId, 'processed_at' => now()]);

                    return true;
                });

                $channel->basic_ack($message->getDeliveryTag());
                if (! $handled) {
                    Log::info("Duplicate delivery skipped: {$type} {$eventId}");
                }
            } catch (Throwable $e) {
                $channel->basic_nack($message->getDeliveryTag(), false, false);
                Log::error("Notification failed: {$type} {$eventId} — {$e->getMessage()}");
            }
        });

        while ($channel->is_consuming()) {
            $channel->wait();
        }

        return self::SUCCESS;
    }
}
