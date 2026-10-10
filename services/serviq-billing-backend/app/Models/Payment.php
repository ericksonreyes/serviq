<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    use HasUuid7;

    protected $fillable = ['invoice_id', 'tenant_id', 'amount_cents', 'method', 'reference', 'recorded_by'];
}
