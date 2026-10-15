<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class RepairGuide extends Model
{
    use HasUuid7;

    protected $fillable = ['tenant_id', 'title', 'body', 'tags', 'created_by', 'embedding'];

    // 768 floats would dwarf the guide in every API response — the vector
    // exists for ordering, never for display.
    protected $hidden = ['embedding'];

    protected $casts = ['tags' => 'array'];
}
