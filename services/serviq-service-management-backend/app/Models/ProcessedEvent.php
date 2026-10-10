<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProcessedEvent extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $primaryKey = 'event_id';

    protected $keyType = 'string';

    protected $fillable = ['event_id', 'processed_at'];
}
