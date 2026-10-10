<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A tenant scope known to IAM. Not the Tenant entity — that belongs to
 * Platform Management. This record only anchors (scope, username)
 * uniqueness and role assignment for a tenant_id.
 */
class TenantScope extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'name'];
}
