<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class FeatureFlag extends Model
{
    use HasUuid7;

    protected $fillable = ['key', 'enabled', 'description'];

    protected $casts = ['enabled' => 'boolean'];
}
