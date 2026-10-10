<?php

return [

    /*
    | JWT issuance (ADR-0001, JWT_SIGNING_KEYS.MD).
    |
    | RS256 is the canonical mode: IAM signs with JWT_PRIVATE_KEY and every
    | other service verifies with JWT_PUBLIC_KEY. When no private key is
    | configured, a local keypair generated into storage/keys/ is used.
    | JWT_SECRET (HS256) is the local/test fallback only — never production.
    */

    'jwt' => [
        'algorithm' => env('JWT_ALGORITHM', 'RS256'),
        'private_key' => env('JWT_PRIVATE_KEY'),
        'public_key' => env('JWT_PUBLIC_KEY'),
        'secret' => env('JWT_SECRET'),
        'issuer' => env('JWT_ISSUER', 'serviq-iam'),
        'audience' => env('JWT_AUDIENCE', 'serviq'),
        'ttl' => (int) env('JWT_TTL', 3600),
        'private_key_path' => env('JWT_PRIVATE_KEY_PATH', storage_path('keys/jwt-private.pem')),
        'public_key_path' => env('JWT_PUBLIC_KEY_PATH', storage_path('keys/jwt-public.pem')),
    ],

    'rabbitmq' => [
        'host' => env('RABBITMQ_HOST', 'rabbitmq'),
        'port' => (int) env('RABBITMQ_PORT', 5672),
        'user' => env('RABBITMQ_USER', 'serviq'),
        'password' => env('RABBITMQ_PASSWORD', 'serviq'),
        'exchange' => env('RABBITMQ_EXCHANGE', 'serviq.events'),
        'queue' => env('RABBITMQ_QUEUE', 'identity-access.events'),
    ],

    'seed' => [
        'admin_username' => env('IAM_SEED_ADMIN_USERNAME', 'admin'),
        'admin_password' => env('IAM_SEED_ADMIN_PASSWORD', 'serviq-local'),
    ],

];
