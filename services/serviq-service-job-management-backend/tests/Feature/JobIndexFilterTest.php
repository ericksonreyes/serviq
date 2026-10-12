<?php

namespace Tests\Feature;

use App\Domain\Jobs\JobLifecycle;
use App\Models\Job;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * ?status=open hides terminal jobs (completed/cancelled) — the console's
 * "Show completed/cancelled" toggle relies on server-side filtering because
 * the list is paginated; a client-side filter can only see one page.
 */
class JobIndexFilterTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = (string) Str::uuid7();
    }

    private function token(): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Dispatcher'], 'jti' => (string) Str::uuid(),
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function index(string $q = '')
    {
        return $this->withToken($this->token())->getJson(
            "/api/v1/tenants/{$this->tenant}/jobs{$q}",
        );
    }

    private function job(array $overrides = []): Job
    {
        return Job::create(array_merge([
            'id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'status' => JobLifecycle::CONFIRMED, 'version' => 2,
        ], $overrides));
    }

    public function test_open_excludes_terminal_statuses(): void
    {
        $open = $this->job(['status' => JobLifecycle::ASSIGNED]);
        $this->job(['status' => JobLifecycle::COMPLETED]);
        $this->job(['status' => JobLifecycle::CANCELLED]);

        $rows = $this->index('?status=open')->assertOk()->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame($open->id, $rows[0]['id']);
    }

    public function test_no_filter_returns_terminal_jobs_too(): void
    {
        $this->job(['status' => JobLifecycle::ASSIGNED]);
        $this->job(['status' => JobLifecycle::COMPLETED]);

        $this->assertCount(2, $this->index()->assertOk()->json('data'));
    }

    public function test_exact_status_still_matches(): void
    {
        $this->job(['status' => JobLifecycle::ASSIGNED]);
        $done = $this->job(['status' => JobLifecycle::COMPLETED]);

        $rows = $this->index('?status=completed')->assertOk()->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame($done->id, $rows[0]['id']);
    }
}
