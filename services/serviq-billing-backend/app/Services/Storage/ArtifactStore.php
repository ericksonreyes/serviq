<?php

namespace App\Services\Storage;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Outbound port for evidence artifacts — the object-store boundary.
 * Controllers declare `ArtifactStore`; the container binds
 * `S3ArtifactStore` (MinIO locally, real S3 by config) or a test fake.
 * Ports exist where substitution is real — storage, messaging, payout
 * gateway — not on single-implementation domain services.
 */
interface ArtifactStore
{
    /**
     * Persist bytes under a tenant/category-scoped key.
     *
     * @return string durable ref "bucket/key" — stored as file_ref
     *
     * @throws \RuntimeException when the object store refuses the write
     */
    public function put(string $tenant, string $category, string $bytes, ?string $filename = null): string;

    /** Stream a stored artifact by ref — null when the ref isn't ours
     *  (legacy label refs, foreign bucket) so the caller decides 404. */
    public function response(string $ref): ?StreamedResponse;
}
