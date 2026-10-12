<?php

namespace Tests\Feature;

use App\Domain\Jobs\JobLifecycle;
use App\Models\Job;
use App\Models\OutboxEvent;
use App\Services\DomainEventRecorder;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * EVENT_DELIVERY.MD: the domain write (event stream + projection) and its
 * outbox row commit together or not at all — a failure between them leaves
 * neither behind, so the relay can never publish a phantom or miss a fact.
 */
class OutboxAtomicityTest extends TestCase
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
            'roles' => ['Dispatcher'], 'permissions' => ['dispatch.assignments.manage'], 'jti' => (string) Str::uuid(),
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function job(): Job
    {
        return Job::create([
            'id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'service_id' => (string) Str::uuid7(), 'status' => JobLifecycle::REQUESTED, 'version' => 1,
        ]);
    }

    public function test_transition_writes_event_projection_and_outbox_together(): void
    {
        $job = $this->job();

        $this->withToken($this->token())
            ->postJson("/api/v1/tenants/{$this->tenant}/jobs/{$job->id}/confirm")->assertOk();

        $this->assertSame(JobLifecycle::CONFIRMED, $job->fresh()->status);
        $this->assertSame(1, DB::table('job_events')->where('job_id', $job->id)->count());
        $row = OutboxEvent::where('type', 'Job.Confirmed')->sole();
        $this->assertSame($job->id, $row->payload['job_id']);
        $this->assertNull($row->published_at);
    }

    public function test_outbox_failure_rolls_back_the_domain_write(): void
    {
        $job = $this->job();
        $this->app->instance(DomainEventRecorder::class, new class extends DomainEventRecorder
        {
            public function record(string $type, array $payload, ?string $tenantId = null): OutboxEvent
            {
                throw new \LogicException('outbox insert failed');
            }
        });

        $this->withToken($this->token())
            ->postJson("/api/v1/tenants/{$this->tenant}/jobs/{$job->id}/confirm")->assertStatus(500);

        $fresh = $job->fresh();
        $this->assertSame(JobLifecycle::REQUESTED, $fresh->status);
        $this->assertSame(1, $fresh->version);
        $this->assertSame(0, DB::table('job_events')->where('job_id', $job->id)->count());
        $this->assertSame(0, OutboxEvent::count());
    }

    public function test_ready_for_assignment_carries_dispatch_fields(): void
    {
        $job = $this->job();
        $job->update(['status' => JobLifecycle::CONFIRMED]);

        $this->withToken($this->token())
            ->postJson("/api/v1/tenants/{$this->tenant}/jobs/{$job->id}/ready")->assertOk();

        $payload = OutboxEvent::where('type', 'Job.ReadyForAssignment')->sole()->payload;
        $this->assertSame($job->service_id, $payload['service_id']);
        $this->assertArrayHasKey('scheduled_for', $payload);
    }
}
