<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    use HasUuid7;

    protected $fillable = ['tenant_id', 'name', 'contact', 'address'];

    protected $casts = ['contact' => 'array', 'address' => 'array'];
}
