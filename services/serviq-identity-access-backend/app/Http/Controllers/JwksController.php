<?php

namespace App\Http\Controllers;

use App\Services\JwtIssuer;
use Illuminate\Http\JsonResponse;

/**
 * Publishes IAM's public key material so other services can verify RS256
 * tokens. Never exposes private key material.
 */
class JwksController
{
    public function __invoke(JwtIssuer $issuer): JsonResponse
    {
        return response()->json($issuer->jwks());
    }
}
