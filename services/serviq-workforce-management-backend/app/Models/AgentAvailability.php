<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class AgentAvailability extends Model
{
    use HasUuid7;

    protected $table = 'agent_availability';

    protected $fillable = ['agent_id', 'day_of_week', 'start_time', 'end_time'];
}
