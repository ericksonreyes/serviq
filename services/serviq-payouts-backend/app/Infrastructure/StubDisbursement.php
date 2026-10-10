<?php

namespace App\Infrastructure;

use App\Domain\Payouts\DisbursementPort;
use App\Models\Payout;

class StubDisbursement implements DisbursementPort
{
    public function disburse(Payout $payout): string
    {
        return 'stub-payout-'.$payout->id;
    }
}
