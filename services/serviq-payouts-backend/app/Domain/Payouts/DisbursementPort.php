<?php

namespace App\Domain\Payouts;

use App\Models\Payout;

/**
 * ADR-0005 adapter boundary — real disbursement rails (bank/wallet APIs)
 * plug in here; the stub returns a deterministic reference.
 */
interface DisbursementPort
{
    /** @return string disbursement reference */
    public function disburse(Payout $payout): string;
}
