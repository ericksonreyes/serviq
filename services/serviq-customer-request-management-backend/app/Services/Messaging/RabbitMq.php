<?php

namespace App\Services\Messaging;

use PhpAmqpLib\Channel\AMQPChannel;
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

/**
 * RabbitMQ adapter behind the messaging port — topic exchange
 * `serviq.events`, per-service queue + DLQ (EVENT_DELIVERY.MD).
 */
class RabbitMq
{
    public function connection(): AMQPStreamConnection
    {
        return new AMQPStreamConnection(
            config('platform.rabbitmq.host'),
            config('platform.rabbitmq.port'),
            config('platform.rabbitmq.user'),
            config('platform.rabbitmq.password'),
        );
    }

    public function exchange(): string
    {
        return config('platform.rabbitmq.exchange');
    }

    public function queue(): string
    {
        return config('platform.rabbitmq.queue');
    }

    public function declareExchange(AMQPChannel $channel): void
    {
        $channel->exchange_declare($this->exchange(), 'topic', false, true, false);
    }

    /**
     * Declare this service's queue with its dead-letter queue, bound with
     * the given routing-key patterns (e.g. ['Platform.*']).
     */
    public function declareQueue(AMQPChannel $channel, array $bindings): string
    {
        $queue = $this->queue();
        $dlq = $queue.'.dlq';
        $dlx = $this->exchange().'.dlx';

        $channel->exchange_declare($dlx, 'direct', false, true, false);
        $channel->queue_declare($dlq, false, true, false, false);
        $channel->queue_bind($dlq, $dlx, $dlq);

        $channel->queue_declare($queue, false, true, false, false, false, [
            'x-dead-letter-exchange' => ['S', $dlx],
            'x-dead-letter-routing-key' => ['S', $dlq],
        ]);

        foreach ($bindings as $binding) {
            $channel->queue_bind($queue, $this->exchange(), $binding);
        }

        return $queue;
    }

    public function publish(AMQPChannel $channel, string $routingKey, array $envelope): void
    {
        $channel->basic_publish(
            new AMQPMessage(json_encode($envelope), [
                'content_type' => 'application/json',
                'delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT,
                'message_id' => $envelope['id'] ?? null,
                'type' => $envelope['type'] ?? null,
            ]),
            $this->exchange(),
            $routingKey,
        );
    }
}
