<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class WorkflowStep extends Model
{
    use HasUuid7;

    protected $fillable = ['service_id', 'position', 'name', 'required_evidence'];

    protected $casts = ['required_evidence' => 'array'];
}
