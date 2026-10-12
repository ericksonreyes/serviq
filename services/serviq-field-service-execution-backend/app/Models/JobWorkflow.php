<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Workflow steps of a job, held until its execution is opened. */
class JobWorkflow extends Model
{
    protected $primaryKey = 'job_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['job_id', 'tenant_id', 'steps'];

    protected $casts = ['steps' => 'array'];
}
