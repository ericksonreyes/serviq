<?php

namespace App\Providers;

use App\Services\JwtIssuer;
use Illuminate\Support\ServiceProvider;
use Throwable;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(JwtIssuer::class);
    }

    public function boot(JwtIssuer $issuer): void
    {
        // Surface the resolved signing mode at startup — a missing keypair
        // must be visible, never a silent downgrade (JWT_SIGNING_KEYS.MD).
        try {
            $issuer->mode();
        } catch (Throwable $e) {
            logger()->warning('JWT signing mode unresolved at boot: '.$e->getMessage());
        }
    }
}
