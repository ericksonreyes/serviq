<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends Model
{
    use HasUuid7;

    protected $fillable = ['code', 'name', 'description', 'price_cents', 'currency', 'features', 'active'];

    protected $casts = [
        'features' => 'array',
        'active' => 'boolean',
    ];

    public function tenants(): HasMany
    {
        return $this->hasMany(Tenant::class);
    }
}
