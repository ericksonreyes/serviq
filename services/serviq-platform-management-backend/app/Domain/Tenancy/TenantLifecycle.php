<?php

namespace App\Domain\Tenancy;

/**
 * Tenant lifecycle state machine (PLATFORM_MANAGEMENT.MD).
 * Pure PHP — spec'd deterministically.
 */
class TenantLifecycle
{
    public const PENDING = 'pending';
    public const ACTIVE = 'active';
    public const SUSPENDED = 'suspended';
    public const DEACTIVATED = 'deactivated';

    private const TRANSITIONS = [
        self::PENDING => [self::ACTIVE, self::DEACTIVATED],
        self::ACTIVE => [self::SUSPENDED, self::DEACTIVATED],
        self::SUSPENDED => [self::ACTIVE, self::DEACTIVATED],
        self::DEACTIVATED => [],
    ];

    public function canTransition(string $from, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }

    /** Statuses from which $to is reachable — used for guarded updates. */
    public function sourcesFor(string $to): array
    {
        return array_keys(array_filter(
            self::TRANSITIONS,
            fn ($targets) => in_array($to, $targets, true)
        ));
    }

    public function isTerminal(string $status): bool
    {
        return $status === self::DEACTIVATED;
    }
}
