<?php

namespace App\Services\Embeddings;

/**
 * Deterministic bag-of-words embedder — hashed word counts into 768
 * buckets, L2-normalized. Texts sharing words score close under cosine
 * distance, so ordering behavior is meaningful in e2e runs without a
 * live model.
 */
final class StubEmbedder implements TextEmbedder
{
    public function embed(string $text): ?array
    {
        $vec = array_fill(0, 768, 0.0);
        foreach (preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($text)) ?: [] as $w) {
            if ($w !== '') {
                $vec[crc32($w) % 768] += 1.0;
            }
        }
        $norm = sqrt(array_sum(array_map(fn ($x) => $x * $x, $vec)));
        return $norm > 0 ? array_map(fn ($x) => $x / $norm, $vec) : $vec;
    }
}
