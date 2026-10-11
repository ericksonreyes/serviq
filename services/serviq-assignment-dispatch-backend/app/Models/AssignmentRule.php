<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AssignmentRule extends Model
{
    protected $primaryKey = 'tenant_id';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['tenant_id', 'strategy', 'offer_ttl_seconds', 'fallback'];

    protected $casts = ['fallback' => 'array'];
}
