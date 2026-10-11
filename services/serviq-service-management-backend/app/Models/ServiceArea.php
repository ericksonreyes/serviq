<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class ServiceArea extends Model
{
    use HasUuid7;

    protected $fillable = ['tenant_id', 'name', 'description', 'geo'];

    protected $casts = ['geo' => 'array'];
}
