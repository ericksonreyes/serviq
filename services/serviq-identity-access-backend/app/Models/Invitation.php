<?php

namespace App\Models;

use App\Models\Concerns\HasUuid7;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * An email invitation into a tenant scope. Only the SHA-256 of the token
 * is stored; the raw token leaves once, in the issuing response/event.
 */
class Invitation extends Model
{
    use HasUuid7;

    public const PENDING = 'pending';

    public const ACCEPTED = 'accepted';

    public const REVOKED = 'revoked';

    public const INVITABLE_ROLES = [Role::CUSTOMER, Role::SERVICE_AGENT];

    public const TTL_DAYS = 7;

    protected $fillable = ['scope', 'email', 'role', 'token_hash', 'invited_by', 'status', 'expires_at', 'accepted_by'];

    protected $casts = ['expires_at' => 'datetime'];

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    /** @return array{0: self, 1: string} the invitation and its raw token */
    public static function issue(string $scope, string $email, string $role, ?string $invitedBy): array
    {
        $token = Str::random(48);
        $invite = static::create([
            'scope' => $scope, 'email' => $email, 'role' => $role,
            'token_hash' => static::hash($token), 'invited_by' => $invitedBy,
            'status' => self::PENDING, 'expires_at' => now()->addDays(self::TTL_DAYS),
        ]);

        return [$invite, $token];
    }

    public function isUsable(): bool
    {
        return $this->status === self::PENDING && $this->expires_at->isFuture();
    }
}
