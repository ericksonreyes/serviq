<?php

namespace App\Domain\Payouts;

/**
 * Agent payout policy (spec stub): a fixed 60% share of the invoice amount,
 * same flat invoice stub Billing uses. Shortfall deductions (ADR-0005)
 * are subtracted from the gross.
 */
class PayoutPolicy
{
    private const SHARE_BPS = 6000;

    public function gross(int $invoiceAmountCents): int
    {
        return intdiv($invoiceAmountCents * self::SHARE_BPS, 10000);
    }

    public function net(int $grossCents, int $shortfallCents): int
    {
        return $grossCents - $shortfallCents; // may go negative (deduction ledger)
    }
}
