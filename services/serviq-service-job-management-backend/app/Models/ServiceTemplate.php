<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceTemplate extends Model
{
    protected $primaryKey = 'service_id';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['service_id', 'tenant_id', 'name', 'steps'];

    protected $casts = ['steps' => 'array'];
}
