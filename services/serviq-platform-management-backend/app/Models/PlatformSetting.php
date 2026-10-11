<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;

/**
 * Platform-wide configuration — a single JSON document (settings and
 * policies) editable only by Platform Administrators.
 */
class PlatformSetting extends Model
{
    use HasUuid7;

    protected $fillable = ['settings'];

    protected $casts = ['settings' => 'array'];

    /** The document is a singleton — always the first (and only) row. */
    public static function document(): self
    {
        return static::query()->first() ?? static::create(['settings' => new \stdClass()]);
    }
}
