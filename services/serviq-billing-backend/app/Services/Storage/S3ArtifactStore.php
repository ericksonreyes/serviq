<?php

namespace App\Services\Storage;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

/**
 * S3/MinIO adapter for ArtifactStore. Owns the bucket-ensure ritual and
 * the "bucket/key" ref shape so controllers never touch disk config.
 */
class S3ArtifactStore implements ArtifactStore
{
    private bool $bucketReady = false;

    public function __construct(
        private Filesystem $disk,
        private string $bucket,
    ) {}

    public function put(string $tenant, string $category, string $bytes, ?string $filename = null): string
    {
        $this->ensureBucket();

        $safe = $filename ? preg_replace('/[^A-Za-z0-9._-]/', '_', $filename) : null;
        $key = "{$tenant}/{$category}/".Str::uuid7().($safe ? '-'.$safe : '');

        if (! $this->disk->put($key, $bytes)) {
            throw new RuntimeException("artifact put failed: {$key}");
        }

        return $this->bucket.'/'.$key;
    }

    public function response(string $ref): ?StreamedResponse
    {
        if (! str_starts_with($ref, $this->bucket.'/')) {
            return null;
        }

        return $this->disk->response(substr($ref, strlen($this->bucket) + 1));
    }

    /** Lazy bucket ensure — tolerant: faked disks (tests) have no
     *  getClient(), and a failed ensure surfaces at `put` anyway. */
    private function ensureBucket(): void
    {
        if ($this->bucketReady) {
            return;
        }
        try {
            $this->disk->getClient()->headBucket(['Bucket' => $this->bucket]);
        } catch (Throwable) {
            try {
                $this->disk->getClient()->createBucket(['Bucket' => $this->bucket]);
            } catch (Throwable) {
            }
        }
        $this->bucketReady = true;
    }
}
