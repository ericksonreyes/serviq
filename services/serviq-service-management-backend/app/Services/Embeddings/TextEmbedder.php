<?php

namespace App\Services\Embeddings;

/**
 * Text → vector port (ADR-0013). Implementations return a 768-dim float
 * array, or null when the provider is unreachable — embedding must never
 * break a write; callers fall back to keyword search.
 */
interface TextEmbedder
{
    public function embed(string $text): ?array;
}
