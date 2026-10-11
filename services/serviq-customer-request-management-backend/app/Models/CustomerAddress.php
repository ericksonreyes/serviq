<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

class CustomerAddress extends Model
{
    use HasUuid7;

    protected $fillable = ['tenant_id', 'customer_id', 'label', 'address', 'is_default'];

    protected $casts = ['address' => 'array', 'is_default' => 'boolean'];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}
