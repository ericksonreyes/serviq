<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    use HasUuid7;

    protected $fillable = [
        'tenant_id', 'user_id', 'channel', 'event_type',
        'title', 'body', 'context', 'status', 'read_at',
    ];

    protected $casts = ['context' => 'array', 'read_at' => 'datetime'];
}
