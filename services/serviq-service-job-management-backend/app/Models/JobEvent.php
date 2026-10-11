<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class JobEvent extends Model
{
    use HasUuid7;

    const CREATED_AT = null;
    const UPDATED_AT = null;

    protected $fillable = ['job_id', 'seq', 'type', 'payload', 'occurred_at'];

    protected $casts = ['payload' => 'array', 'occurred_at' => 'datetime'];
}
