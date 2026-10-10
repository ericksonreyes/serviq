<?php

namespace App\Support;

use Ramsey\Uuid\Uuid;

final class Uuid7
{
    public static function new(): string
    {
        return Uuid::uuid7()->toString();
    }
}
