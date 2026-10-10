<?php

namespace App\Console\Commands;

use App\Models\ProcessedEvent;
use App\Services\Messaging\RabbitMq;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

// Pure consumer of record: keeps the dedupe table warm so the service can
// subscribe broadly later without replay. No projections needed yet.
class EventsConsume extends Command
{
    protected $signature = 'events:consume';

    private const BINDINGS = ['Job.*', 'Invoice.*', 'Request.*', 'Support.*'];

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
            try {
                if ($eventId === null) {
                    throw new \RuntimeException('Envelope missing id');
                }
                ProcessedEvent::firstOrCreate(['event_id' => $eventId], ['processed_at' => now()]);
                $channel->basic_ack($message->getDeliveryTag());
            } catch (Throwable $e) {
                $channel->basic_nack($message->getDeliveryTag(), false, false);
                Log::error("Event handling failed: {$eventId} — {$e->getMessage()}");
            }
        });

        while ($channel->is_consuming()) {
            $channel->wait();
        }

        return self::SUCCESS;
    }
}
