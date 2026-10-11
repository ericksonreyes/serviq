<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class Evidence extends Model
{
    use HasUuid7;

    protected $table = 'evidence';

    protected $fillable = [
        'execution_id', 'tenant_id', 'step_position', 'kind',
        'object_ref', 'content_type', 'data',
    ];

    protected $casts = ['data' => 'array'];
}
