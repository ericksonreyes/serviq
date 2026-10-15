<?php

namespace App\Services\Embeddings;

use Illuminate\Support\Facades\Http;
use Throwable;

/** Gemini embedContent — text-embedding-004 returns 768 dims. */
final class GeminiEmbedder implements TextEmbedder
{
    public function embed(string $text): ?array
    {
        try {
            $model = env('EMBEDDING_MODEL') ?: 'text-embedding-004';
            $base = rtrim(env('EMBEDDING_BASE_URL') ?: 'https://generativelanguage.googleapis.com/v1beta', '/');
            $res = Http::timeout(10)
                ->withHeaders(['x-goog-api-key' => env('EMBEDDING_API_KEY')])
                ->post("{$base}/models/{$model}:embedContent", [
                    'content' => ['parts' => [['text' => $text]]],
                ]);
            $vec = $res->json('embedding.values');
            return is_array($vec) ? array_values($vec) : null;
        } catch (Throwable) {
            return null;
        }
    }
}
