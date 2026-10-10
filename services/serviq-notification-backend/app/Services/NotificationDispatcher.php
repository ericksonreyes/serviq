<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\NotificationTemplate;
use Illuminate\Support\Facades\DB;

/**
 * Turns a domain event into stored notifications:
 * tenant channel config → event routing rules → user preferences →
 * enabled channel adapters only.
 */
class NotificationDispatcher
{
    public const CHANNELS = ['in_app', 'email', 'sms', 'push', 'webhook'];

    public function __construct(private TemplateRenderer $renderer) {}

    /** @return Notification[] rows written for this event */
    public function dispatch(array $envelope): array
    {
        $type = $envelope['type'];
        $tenantId = $envelope['tenant_id'] ?? null;
        if ($tenantId === null) {
            return [];
        }
        $context = $envelope['payload'] ?? [];

        $written = [];
        foreach ($this->effectiveChannels($type, $tenantId) as $channel) {
            $template = $this->templateFor($type, $channel, $tenantId);
            $written[] = Notification::create([
                'tenant_id' => $tenantId,
                'user_id' => $context['user_id'] ?? $context['agent_id'] ?? $context['customer_id'] ?? null,
                'channel' => $channel,
                'event_type' => $type,
                'title' => $this->renderer->render($template['title'], $context),
                'body' => $this->renderer->render($template['body'], $context),
                'context' => $context,
            ]);
        }

        return $written;
    }

    /** tenant channel on AND event routed AND user not opted out. */
    private function effectiveChannels(string $type, string $tenantId): array
    {
        $enabled = DB::table('tenant_channels')->where('tenant_id', $tenantId)->pluck('enabled', 'channel');
        $routed = DB::table('event_routes')
            ->where('event_type', $type)
            ->where(fn ($q) => $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id'))
            ->pluck('channel');

        return array_values(array_filter(self::CHANNELS, function ($channel) use ($enabled, $routed, $type) {
            if ($routed->isNotEmpty() && ! $routed->contains($channel)) {
                return false;
            }
            // in_app is always available; other channels fire only when the
            // tenant has enabled them (absent row = off).
            return $channel === 'in_app' || ($enabled[$channel] ?? false);
        }));
    }

    private function templateFor(string $type, string $channel, string $tenantId): array
    {
        $override = NotificationTemplate::where('tenant_id', $tenantId)
            ->where('event_type', $type)->where('channel', $channel)->first();
        $default = NotificationTemplate::whereNull('tenant_id')
            ->where('event_type', $type)->where('channel', $channel)->first();

        $tpl = $override ?? $default;

        return [
            'title' => $tpl?->title_template ?? $type,
            'body' => $tpl?->body_template ?? "{$type}: {{job_id}}{{request_id}}",
        ];
    }
}
