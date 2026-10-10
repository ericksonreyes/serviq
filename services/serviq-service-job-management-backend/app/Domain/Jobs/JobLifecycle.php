<?php

namespace App\Domain\Jobs;

/**
 * Fixed job lifecycle — other contexts rely only on these statuses/events.
 * Workflow steps are data, never statuses.
 */
class JobLifecycle
{
    public const REQUESTED = 'requested';
    public const CONFIRMED = 'confirmed';
    public const READY = 'ready_for_assignment';
    public const ASSIGNED = 'assigned';
    public const ACCEPTED = 'accepted';
    public const IN_PROGRESS = 'in_progress';
    public const COMPLETED = 'completed';
    public const CANCELLED = 'cancelled';

    public const TERMINAL = [self::COMPLETED, self::CANCELLED];

    private const TRANSITIONS = [
        self::REQUESTED => [self::CONFIRMED, self::CANCELLED],
        self::CONFIRMED => [self::READY, self::CANCELLED],
        self::READY => [self::ASSIGNED, self::CANCELLED],
        self::ASSIGNED => [self::ACCEPTED, self::CANCELLED],
        self::ACCEPTED => [self::IN_PROGRESS, self::CANCELLED],
        self::IN_PROGRESS => [self::COMPLETED, self::CANCELLED],
        self::COMPLETED => [],
        self::CANCELLED => [],
    ];

    public function canTransition(string $from, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }

    public function next(string $from): ?string
    {
        $targets = self::TRANSITIONS[$from] ?? [];

        return $targets === [] ? null : $targets[0];
    }
}
