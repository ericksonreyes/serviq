<?php

return [

    /*
    | JWT validation (ADR-0001, JWT_SIGNING_KEYS.MD).
    |
    | This service verifies tokens issued by IAM — it never signs. The
    | public key comes from JWT_PUBLIC_KEY, else fetched from IAM's JWKS
    | endpoint. JWT_SECRET (HS256) is the local/test fallback only.
    */

    'jwt' => [
        'public_key' => env('JWT_PUBLIC_KEY'),
        'secret' => env('JWT_SECRET'),
        'jwks_url' => env('JWT_JWKS_URL'),
        'issuer' => env('JWT_ISSUER', 'serviq-iam'),
        'audience' => env('JWT_AUDIENCE', 'serviq'),
    ],

    'rabbitmq' => [
        'host' => env('RABBITMQ_HOST', 'rabbitmq'),
        'port' => (int) env('RABBITMQ_PORT', 5672),
        'user' => env('RABBITMQ_USER', 'serviq'),
        'password' => env('RABBITMQ_PASSWORD', 'serviq'),
        'exchange' => env('RABBITMQ_EXCHANGE', 'serviq.events'),
        'queue' => env('RABBITMQ_QUEUE', 'billing.events'),
    ],

];
