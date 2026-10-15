<?php

namespace App\Services\Embeddings;

use Illuminate\Support\Facades\Http;
use Throwable;

/** OpenAI embeddings — dimensions pinned to the column's 768. */
final class OpenAiEmbedder implements TextEmbedder
{
    public function embed(string $text): ?array
    {
        try {
            $base = rtrim(env('EMBEDDING_BASE_URL') ?: 'https://api.openai.com/v1', '/');
            $res = Http::timeout(10)
                ->withToken(env('EMBEDDING_API_KEY'))
                ->post("{$base}/embeddings", [
                    'model' => env('EMBEDDING_MODEL') ?: 'text-embedding-3-small',
                    'input' => $text,
                    'dimensions' => 768,
                ]);
            $vec = $res->json('data.0.embedding');
            return is_array($vec) ? array_values($vec) : null;
        } catch (Throwable) {
            return null;
        }
    }
}
