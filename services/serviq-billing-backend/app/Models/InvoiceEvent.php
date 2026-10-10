<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoiceEvent extends Model
{
    protected $fillable = ['invoice_id', 'seq', 'type', 'payload'];

    protected $casts = ['payload' => 'array'];
}
