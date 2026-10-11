<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A service in a tenant's catalog ("Refrigerator Repair") plus its ordered
 * workflow template. Named CatalogService because `Service` collides with
 * framework naming conventions.
 */
class CatalogService extends Model
{
    use HasUuid7;

    protected $table = 'services';

    protected $fillable = [
        'tenant_id', 'name', 'description', 'price_cents', 'currency', 'price_type',
        'estimated_minutes', 'required_skills', 'service_areas', 'active',
    ];

    protected $casts = [
        'required_skills' => 'array',
        'service_areas' => 'array',
        'active' => 'boolean',
    ];

    public function workflowSteps(): HasMany
    {
        return $this->hasMany(WorkflowStep::class, 'service_id')->orderBy('position');
    }
}
