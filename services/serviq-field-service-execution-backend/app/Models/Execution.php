<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Execution extends Model
{
    use HasUuid7;

    protected $fillable = [
        'job_id', 'tenant_id', 'agent_id', 'assignment_id',
        'status', 'checked_in_at', 'workflow_instance',
    ];

    protected $casts = ['checked_in_at' => 'datetime', 'workflow_instance' => 'array'];

    public function evidence(): HasMany
    {
        return $this->hasMany(Evidence::class);
    }
}
