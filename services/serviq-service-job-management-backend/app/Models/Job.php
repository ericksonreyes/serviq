<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Job extends Model
{
    use HasUuid7;

    protected $fillable = [
        'tenant_id', 'request_id', 'service_id', 'customer_id',
        'assigned_agent_id', 'status', 'workflow_instance', 'version',
    ];

    protected $casts = ['workflow_instance' => 'array'];

    public function events(): HasMany
    {
        return $this->hasMany(JobEvent::class)->orderBy('seq');
    }
}
