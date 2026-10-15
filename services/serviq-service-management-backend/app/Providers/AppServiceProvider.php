<?php

namespace App\Providers;

use App\Services\Embeddings\GeminiEmbedder;
use App\Services\Embeddings\OllamaEmbedder;
use App\Services\Embeddings\OpenAiEmbedder;
use App\Services\Embeddings\StubEmbedder;
use App\Services\Embeddings\TextEmbedder;
use App\Services\JwtVerifier;
use Illuminate\Support\ServiceProvider;
use Throwable;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(JwtVerifier::class);
        $this->app->bind(TextEmbedder::class, fn () => match (env('EMBEDDING_PROVIDER', 'ollama')) {
            'gemini' => new GeminiEmbedder(),
            'openai' => new OpenAiEmbedder(),
            'ollama' => new OllamaEmbedder(),
            default => new StubEmbedder(),
        });
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
