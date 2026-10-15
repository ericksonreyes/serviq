<?php

namespace App\Providers;

use App\Services\JwtVerifier;
use App\Services\Storage\ArtifactStore;
use App\Services\Storage\S3ArtifactStore;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\ServiceProvider;
use Throwable;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(JwtVerifier::class);
        $this->app->bind(ArtifactStore::class, fn () => new S3ArtifactStore(
            Storage::disk('s3'), (string) config('filesystems.disks.s3.bucket'),
        ));
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

        // RLS bypass for console processes (ADR-0028) — artisan commands
        // (outbox relay, consumers, seeders, tinker) legitimately cross
        // tenants; the HTTP surface is the boundary the policies guard.
        if ($this->app->runningInConsole()) {
            \Illuminate\Support\Facades\Event::listen(
                \Illuminate\Console\Events\CommandStarting::class,
                fn () => \App\Support\TenantContext::asSystem(),
            );
        }
    }
}
