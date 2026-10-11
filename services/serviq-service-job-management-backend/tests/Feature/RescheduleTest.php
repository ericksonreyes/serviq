<?php

namespace Tests\Feature;

use App\Domain\Jobs\JobLifecycle;
use App\Models\Job;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Rescheduling rules: only unassigned, non-terminal, non-in-flight jobs
 * may move. Everything else is an illegal transition (409).
 */
class RescheduleTest extends TestCase
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

    private function job(array $overrides = []): Job
    {
        return Job::create(array_merge([
            'id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'status' => JobLifecycle::CONFIRMED, 'version' => 2,
        ], $overrides));
    }

    private function reschedule(Job $job, ?string $when = null)
    {
        return $this->withToken($this->token())->postJson(
            "/api/v1/tenants/{$this->tenant}/jobs/{$job->id}/reschedule",
            ['scheduled_for' => $when ?? now()->addDays(2)->toIso8601String()],
        );
    }

    public function test_unscheduled_job_can_be_rescheduled(): void
    {
        $job = $this->job();
        $when = now()->addDays(3)->toIso8601String();

        $this->reschedule($job, $when)->assertOk();
        $this->assertDatabaseHas('job_events', ['job_id' => $job->id, 'type' => 'Job.Rescheduled']);
        $this->assertDatabaseHas('outbox', ['type' => 'Job.Rescheduled']);
    }

    public function test_assigned_inflight_and_terminal_jobs_reject_reschedule(): void
    {
        // assigned_agent_id set — no matter the status
        $this->reschedule($this->job(['assigned_agent_id' => (string) Str::uuid7()]))->assertStatus(409);

        foreach ([JobLifecycle::IN_PROGRESS, JobLifecycle::COMPLETED, JobLifecycle::CANCELLED] as $status) {
            $this->reschedule($this->job(['status' => $status]))->assertStatus(409);
        }
    }

    public function test_reschedule_validates_and_scopes_tenant(): void
    {
        $job = $this->job();
        // missing scheduled_for
        $this->withToken($this->token())->postJson(
            "/api/v1/tenants/{$this->tenant}/jobs/{$job->id}/reschedule", [],
        )->assertStatus(422);

        // foreign tenant's job → 404
        $other = $this->job(['tenant_id' => (string) Str::uuid7()]);
        $this->reschedule($other)->assertNotFound();
    }
}
