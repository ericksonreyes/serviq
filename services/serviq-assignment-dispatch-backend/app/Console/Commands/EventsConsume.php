<?php

namespace App\Console\Commands;

use App\Events\Handlers\AgentProjectionHandler;
use App\Events\Handlers\JobEventHandler;
use App\Models\ProcessedEvent;
use App\Services\Messaging\RabbitMq;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class EventsConsume extends Command
{
    protected $signature = 'events:consume';

    protected $description = 'Consume domain events from serviq.events';

    private const BINDINGS = ['Job.*', 'Workforce.*'];

    private const HANDLERS = [
        'Job.ReadyForAssignment' => JobEventHandler::class,
        'Job.Assigned' => JobEventHandler::class,
        'Job.Accepted' => JobEventHandler::class,
        'Job.Completed' => JobEventHandler::class,
        'Job.Cancelled' => JobEventHandler::class,
        'Workforce.AgentRegistered' => AgentProjectionHandler::class,
        'Workforce.AgentUpdated' => AgentProjectionHandler::class,
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
