<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class Assignment extends Model
{
    use HasUuid7;

    public const OFFERED = 'offered';
    public const ACCEPTED = 'accepted';
    public const REJECTED = 'rejected';
    public const REVOKED = 'revoked';
    public const EXPIRED = 'expired';

    protected $fillable = [
        'job_id', 'tenant_id', 'agent_id', 'strategy', 'status', 'expires_at',
    ];

    protected $casts = ['expires_at' => 'datetime'];
}
