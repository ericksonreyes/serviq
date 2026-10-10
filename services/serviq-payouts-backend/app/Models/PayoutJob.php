<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayoutJob extends Model
{
    protected $primaryKey = 'job_id';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['job_id', 'tenant_id', 'agent_id', 'job_status'];
}
