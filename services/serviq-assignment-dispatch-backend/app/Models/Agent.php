<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Agent extends Model
{
    protected $primaryKey = 'agent_id';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['agent_id', 'tenant_id', 'name', 'skills', 'service_areas', 'capacity', 'status'];

    protected $casts = ['skills' => 'array', 'service_areas' => 'array'];
}
