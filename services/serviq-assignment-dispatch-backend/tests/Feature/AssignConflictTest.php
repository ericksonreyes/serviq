<?php

namespace Tests\Feature;

use App\Models\Agent;
use App\Models\Assignment;
use App\Models\DispatchableJob;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Dispatcher assign must not stack a second accepted assignment on a job
 * that is already assigned — auto-dispatch can win the race, and the
 * partial unique index must surface as 409, not a raw 500.
 */
class AssignConflictTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant;
    private string $job;
    private string $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = (string) Str::uuid7();
        $this->job = (string) Str::uuid7();
        $this->agent = (string) Str::uuid7();

        Agent::create([
            'agent_id' => $this->agent, 'tenant_id' => $this->tenant,
            'name' => 'Test Agent', 'skills' => [], 'service_areas' => [],
            'capacity' => 3, 'status' => 'active',
        ]);
    }

    private function token(): string
    {
        return JWT::encode([
            'iss' => 'serviq-iam', 'aud' => 'serviq',
            'sub' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'roles' => ['Dispatcher'],
            'permissions' => ['dispatch.assignments.manage'],
            'jti' => (string) Str::uuid(),
            'iat' => time(), 'exp' => time() + 3600,
        ], config('platform.jwt.secret'), 'HS256');
    }

    private function job(string $status): DispatchableJob
    {
        return DispatchableJob::create([
            'job_id' => $this->job, 'tenant_id' => $this->tenant,
            'service_id' => (string) Str::uuid7(), 'status' => $status,
        ]);
    }

    private function assign()
    {
        return $this->withToken($this->token())->postJson(
            "/api/v1/tenants/{$this->tenant}/dispatch/assign",
            ['job_id' => $this->job, 'agent_id' => $this->agent],
        );
    }

    public function test_assign_ready_job_creates_accepted_assignment(): void
    {
        $this->job('ready_for_assignment');

        $this->assign()->assertCreated();

        $this->assertSame('accepted', Assignment::where('job_id', $this->job)->sole()->status);
        $this->assertSame('assigned', DispatchableJob::find($this->job)->status);
    }

    public function test_assign_on_assigned_job_returns_409_without_stacking(): void
    {
        $this->job('ready_for_assignment');
        $this->assign()->assertCreated();

        $other = Agent::create([
            'agent_id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'name' => 'Other Agent', 'skills' => [], 'service_areas' => [],
            'capacity' => 3, 'status' => 'active',
        ]);

        $this->withToken($this->token())->postJson(
            "/api/v1/tenants/{$this->tenant}/dispatch/assign",
            ['job_id' => $this->job, 'agent_id' => $other->agent_id],
        )->assertStatus(409)->assertJson(['error' => 'job_already_assigned']);

        $this->assertSame(1, Assignment::where('job_id', $this->job)->where('status', 'accepted')->count());
    }

    public function test_broadcast_on_assigned_job_returns_409(): void
    {
        $this->job('assigned');

        $this->withToken($this->token())->postJson(
            "/api/v1/tenants/{$this->tenant}/dispatch/broadcast",
            ['job_id' => $this->job],
        )->assertStatus(409)->assertJson(['error' => 'job_already_assigned']);
    }

    private function otherAgent(): Agent
    {
        return Agent::create([
            'agent_id' => (string) Str::uuid7(), 'tenant_id' => $this->tenant,
            'name' => 'Other Agent', 'skills' => [], 'service_areas' => [],
            'capacity' => 3, 'status' => 'active',
        ]);
    }

    private function reassign(string $agentId)
    {
        return $this->withToken($this->token())->postJson(
            "/api/v1/tenants/{$this->tenant}/dispatch/reassign",
            ['job_id' => $this->job, 'agent_id' => $agentId],
        );
    }

    public function test_reassign_swaps_agent_and_revokes_prior(): void
    {
        $this->job('ready_for_assignment');
        $this->assign()->assertCreated();
        $other = $this->otherAgent();

        $this->reassign($other->agent_id)->assertOk();

        $assignments = Assignment::where('job_id', $this->job)->get();
        $this->assertSame('revoked', $assignments->firstWhere('agent_id', $this->agent)->status);
        $this->assertSame('accepted', $assignments->firstWhere('agent_id', $other->agent_id)->status);
        $this->assertSame(1, $assignments->where('status', 'accepted')->count());
        $this->assertSame('assigned', DispatchableJob::find($this->job)->status);
    }

    public function test_reassign_same_agent_is_idempotent(): void
    {
        $this->job('ready_for_assignment');
        $this->assign()->assertCreated();

        $this->reassign($this->agent)->assertOk();

        $this->assertSame(1, Assignment::where('job_id', $this->job)->count());
        $this->assertSame(0, Assignment::where('job_id', $this->job)->where('status', 'revoked')->count());
    }

    public function test_reassign_on_unassigned_job_returns_409(): void
    {
        $this->job('ready_for_assignment');

        $this->reassign($this->agent)
            ->assertStatus(409)->assertJson(['error' => 'job_not_assigned']);
    }

    public function test_reassign_after_agent_accepted_returns_409(): void
    {
        $this->job('agent_accepted');

        $this->reassign($this->agent)
            ->assertStatus(409)->assertJson(['error' => 'reassign_window_closed']);
    }
}
