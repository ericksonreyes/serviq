<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DispatchableJob extends Model
{
    protected $primaryKey = 'job_id';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['job_id', 'tenant_id', 'service_id', 'status'];
}
