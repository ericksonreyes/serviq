<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class SupportCase extends Model
{
    use HasUuid7;

    protected $table = 'cases';

    protected $fillable = ['tenant_id', 'job_id', 'invoice_id', 'customer_id', 'subject', 'status', 'details'];

    protected $casts = ['details' => 'array'];
}
