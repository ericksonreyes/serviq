<?php

namespace App\Providers;

use App\Services\JwtVerifier;
use Illuminate\Support\ServiceProvider;
use Throwable;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(JwtVerifier::class);
    }

    public function boot(): void
    {
        // Surface the resolved signing mode at startup — a missing keypair
        // must be visible, never a silent downgrade (JWT_SIGNING_KEYS.MD).
        // Probe on a throwaway instance: memoizing on the singleton here
        // would freeze the mode before runtime config overrides (tests).
        try {
            (new JwtVerifier)->mode();
        } catch (Throwable $e) {
            logger()->warning('JWT signing mode unresolved at boot: '.$e->getMessage());
        }
    }
}
