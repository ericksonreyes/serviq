<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class ServiceRequest extends Model
{
    use HasUuid7;

    public const SUBMITTED = 'submitted';
    public const REVIEWED = 'reviewed';
    public const CONVERTED = 'converted';
    public const CANCELLED = 'cancelled';

    protected $fillable = ['tenant_id', 'customer_id', 'service_id', 'status', 'details'];

    protected $casts = ['details' => 'array'];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}
