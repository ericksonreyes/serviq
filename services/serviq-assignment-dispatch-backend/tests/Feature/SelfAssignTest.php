<?php

namespace Tests\Feature;

use App\Models\Agent;
use App\Models\Assignment;
use App\Models\AssignmentRule;
use App\Models\DispatchableJob;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Self-assign pool: an agent claims a ready_for_assignment job — only while
 * the tenant strategy is `self`. Under any other strategy a claim would
 * steal jobs from live offers or bypass the dispatcher gate.
 */
class SelfAssignTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = (string) Str::uuid7();
        $this->agent = (string) Str::uuid7();
        Agent::create([
            'agent_id' => $this->agent, 'tenant_id' => $this->tenant,
            'name' => 'Test Agent', 'status' => 'active',
        ]);
    }

    private function token(): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Service Agent'], 'permissions' => ['jobs.execute'],
            'jti' => (string) Str::uuid(),
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function readyJob(): DispatchableJob
    {
        return DispatchableJob::create([
            'job_id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'status' => 'ready_for_assignment',
        ]);
    }

    private function claim(string $jobId, ?string $agentId = null)
    {
        return $this->withToken($this->token())->postJson(
            "/api/v1/tenants/{$this->tenant}/dispatch/self-assign",
            ['job_id' => $jobId, 'agent_id' => $agentId ?? $this->agent],
        );
    }

    public function test_agent_claims_ready_job_under_self_strategy(): void
    {
        AssignmentRule::create(['tenant_id' => $this->tenant, 'strategy' => 'self']);
        $job = $this->readyJob();

        $this->claim($job->job_id)
            ->assertCreated()
            ->assertJsonPath('data.status', Assignment::ACCEPTED)
            ->assertJsonPath('data.strategy', 'self')
            ->assertJsonPath('data.agent_id', $this->agent);

        $this->assertEquals('assigned', $job->fresh()->status);
        $this->assertDatabaseHas('outbox', ['type' => 'Assignment.Accepted']);
    }

    public function test_claim_is_rejected_under_other_strategies(): void
    {
        // Default with no configured rule is `automatic` — no open pool.
        $job = $this->readyJob();
        $this->claim($job->job_id)
            ->assertStatus(409)
            ->assertJsonPath('error', 'self_assign_disabled');

        AssignmentRule::create(['tenant_id' => $this->tenant, 'strategy' => 'dispatcher']);
        $this->claim($job->job_id)->assertStatus(409);

        $this->assertEquals('ready_for_assignment', $job->fresh()->status);
        $this->assertDatabaseMissing('assignments', ['job_id' => $job->job_id]);
    }

    public function test_taken_job_can_not_be_claimed_twice(): void
    {
        AssignmentRule::create(['tenant_id' => $this->tenant, 'strategy' => 'self']);
        $job = $this->readyJob();

        $this->claim($job->job_id)->assertCreated();

        Agent::create([
            'agent_id' => $rival = (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'name' => 'Rival', 'status' => 'active',
        ]);
        $this->claim($job->job_id, $rival)->assertNotFound();
    }
}
