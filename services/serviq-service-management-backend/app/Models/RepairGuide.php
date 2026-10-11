<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class RepairGuide extends Model
{
    use HasUuid7;

    protected $fillable = ['tenant_id', 'title', 'body', 'tags', 'created_by'];

    protected $casts = ['tags' => 'array'];
}
