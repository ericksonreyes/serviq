<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class Payout extends Model
{
    use HasUuid7;

    protected $fillable = ['job_id', 'tenant_id', 'agent_id', 'amount_cents', 'shortfall_cents', 'applied_cents', 'net_cents', 'status', 'disbursement_ref', 'version'];
}
