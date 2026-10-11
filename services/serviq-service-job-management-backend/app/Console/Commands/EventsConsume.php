<?php

namespace App\Console\Commands;

use App\Events\Handlers\AssignmentAcceptedHandler;
use App\Events\Handlers\ExecutionEventHandler;
use App\Events\Handlers\RequestSubmittedHandler;
use App\Events\Handlers\ServiceTemplateHandler;
use App\Models\ProcessedEvent;
use App\Services\Messaging\RabbitMq;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Dedicated consumer — creates jobs from Request.Submitted and maintains
 * the local service-template projection from ServiceManagement.* events.
 */
class EventsConsume extends Command
{
    protected $signature = 'events:consume';

    protected $description = 'Consume domain events from serviq.events';

    private const BINDINGS = ['Request.*', 'ServiceManagement.*', 'Assignment.*', 'Execution.*'];

    private const HANDLERS = [
        'Request.Submitted' => RequestSubmittedHandler::class,
        'ServiceManagement.ServiceCreated' => ServiceTemplateHandler::class,
        'ServiceManagement.WorkflowTemplateChanged' => ServiceTemplateHandler::class,
        'Assignment.Accepted' => AssignmentAcceptedHandler::class,
        'Execution.CheckedIn' => ExecutionEventHandler::class,
        'Execution.StepStarted' => ExecutionEventHandler::class,
        'Execution.StepCompleted' => ExecutionEventHandler::class,
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
