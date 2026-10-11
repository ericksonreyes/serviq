<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    use HasUuid7;

    protected $fillable = ['job_id', 'tenant_id', 'customer_id', 'agent_id', 'status', 'amount_cents', 'currency', 'version'];

    public const ISSUED = 'issued';
    public const PAID = 'paid';
    public const REMITTED = 'remitted';
    public const REFUNDED = 'refunded';
}
