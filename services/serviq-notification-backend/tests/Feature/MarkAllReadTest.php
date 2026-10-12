<?php

namespace Tests\Feature;

use App\Models\Notification;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * POST /notifications/read-all marks every unread row in the tenant feed —
 * and only that tenant's. ?user_id= narrows it to one recipient's unread
 * rows, matching the feed's scoping rules.
 */
class MarkAllReadTest extends TestCase
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

    private function notice(array $overrides = []): Notification
    {
        return Notification::create(array_merge([
            'tenant_id' => $this->tenant, 'channel' => 'in_app',
            'event_type' => 'Test.Event', 'title' => 't', 'body' => 'b',
        ], $overrides));
    }

    private function markAll(string $q = '')
    {
        return $this->withToken($this->token())->postJson(
            "/api/v1/tenants/{$this->tenant}/notifications/read-all{$q}",
        );
    }

    public function test_marks_all_unread_in_tenant(): void
    {
        $this->notice();
        $this->notice();
        $read = $this->notice(['read_at' => now()]);

        $this->markAll()->assertOk()->assertJsonPath('data.marked', 2);

        $this->assertSame(0, Notification::where('tenant_id', $this->tenant)->whereNull('read_at')->count());
        $this->assertNotNull($read->fresh()->read_at);
    }

    public function test_other_tenant_untouched(): void
    {
        $this->notice();
        $foreign = $this->notice(['tenant_id' => (string) Str::uuid7()]);

        $this->markAll()->assertOk()->assertJsonPath('data.marked', 1);

        $this->assertNull($foreign->fresh()->read_at);
    }

    public function test_user_id_scopes_the_mark(): void
    {
        $mine = $this->notice(['user_id' => 'u1']);
        $this->notice(['user_id' => 'u2']);
        $this->notice();

        $this->markAll('?user_id=u1')->assertOk()->assertJsonPath('data.marked', 1);

        $this->assertNotNull($mine->fresh()->read_at);
        $this->assertSame(2, Notification::where('tenant_id', $this->tenant)->whereNull('read_at')->count());
    }

    public function test_nothing_to_mark_is_fine(): void
    {
        $this->notice(['read_at' => now()]);

        $this->markAll()->assertOk()->assertJsonPath('data.marked', 0);
    }
}
