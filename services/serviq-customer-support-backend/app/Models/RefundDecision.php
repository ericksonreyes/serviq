<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class RefundDecision extends Model
{
    use HasUuid7;

    protected $fillable = ['case_id', 'invoice_id', 'tenant_id', 'amount_cents', 'decision', 'reason', 'decided_by'];
}
