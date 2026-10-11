<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class Remittance extends Model
{
    use HasUuid7;

    protected $fillable = ['tenant_id', 'status', 'total_cents'];
}
