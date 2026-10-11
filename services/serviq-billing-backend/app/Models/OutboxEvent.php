<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class OutboxEvent extends Model
{
    use HasUuid7;

    protected $table = 'outbox';

    public $timestamps = false;

    protected $fillable = [
        'type', 'payload', 'occurred_at', 'tenant_id', 'actor_service', 'on_behalf_of', 'published_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'occurred_at' => 'datetime',
        'published_at' => 'datetime',
    ];
}
