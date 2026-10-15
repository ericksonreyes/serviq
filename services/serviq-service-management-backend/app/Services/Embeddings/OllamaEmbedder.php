<?php

namespace App\Services\Embeddings;

use Illuminate\Support\Facades\Http;
use Throwable;

/** Local Ollama embeddings — default nomic-embed-text (768 dims). */
final class OllamaEmbedder implements TextEmbedder
{
    public function embed(string $text): ?array
    {
        try {
            $base = rtrim(env('EMBEDDING_BASE_URL') ?: 'http://infra-ollama:11434', '/');
            $model = env('EMBEDDING_MODEL') ?: 'nomic-embed-text';
            $res = Http::timeout(10)->post("{$base}/api/embed", ['model' => $model, 'input' => $text]);
            $vec = $res->json('embeddings.0');
            return is_array($vec) ? array_values($vec) : null;
        } catch (Throwable) {
            return null;
        }
    }
}
