<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class NotificationTemplate extends Model
{
    use HasUuid7;

    protected $fillable = ['tenant_id', 'event_type', 'channel', 'title_template', 'body_template'];
}
