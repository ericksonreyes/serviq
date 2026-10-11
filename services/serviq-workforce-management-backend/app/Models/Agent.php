<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Agent extends Model
{
    use HasUuid7;

    protected $fillable = [
        'tenant_id', 'user_id', 'name', 'skills', 'certifications',
        'service_areas', 'capacity', 'status',
    ];

    protected $casts = [
        'skills' => 'array',
        'certifications' => 'array',
        'service_areas' => 'array',
    ];

    public function availability(): HasMany
    {
        return $this->hasMany(AgentAvailability::class);
    }

    /** "Can this agent perform this job?" — capability, not dispatch policy. */
    public function isCapableOf(array $requiredSkills = [], ?string $area = null): bool
    {
        if ($this->status !== 'active') {
            return false;
        }
        if ($requiredSkills !== [] && array_diff($requiredSkills, $this->skills ?? []) !== []) {
            return false;
        }
        if ($area !== null && ($this->service_areas ?? []) !== [] && ! in_array($area, $this->service_areas, true)) {
            return false;
        }

        return true;
    }
}
