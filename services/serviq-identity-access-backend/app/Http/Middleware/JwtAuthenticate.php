<?php

namespace App\Http\Middleware;

use App\Auth\TokenIdentity;
use App\Services\JwtIssuer;
use App\Services\TokenBlacklist;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class JwtAuthenticate
{
    public function __construct(
        private JwtIssuer $issuer,
        private TokenBlacklist $blacklist,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if ($token === null || $token === '') {
            return $this->unauthorized('missing_token', 'Bearer token required');
        }

        try {
            $claims = $this->issuer->verify($token);
        } catch (Throwable) {
            return $this->unauthorized('invalid_token', 'Token is invalid or expired');
        }

        if ($this->blacklist->isRevoked($claims['jti'])) {
            return $this->unauthorized('token_revoked', 'Token has been revoked');
        }

        $identity = new TokenIdentity($claims);
        $request->setUserResolver(fn () => $identity);
        $request->attributes->set('jwt', $claims);

        return $next($request);
    }

    private function unauthorized(string $code, string $message): Response
    {
        return response()->json(['error' => $code, 'message' => $message], 401);
    }
}
