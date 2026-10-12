<?php

namespace Tests\Feature;

use App\Domain\Tenancy\TenantLifecycle;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProviderDirectoryTest extends TestCase
{
    use RefreshDatabase;

    private function provider(array $attrs): Tenant
    {
        $target = $attrs['status'] ?? TenantLifecycle::PENDING;
        // ACTIVE is reachable only via a transition — create PENDING first.
        $attrs['status'] = $target === TenantLifecycle::ACTIVE ? TenantLifecycle::PENDING : $target;
        $tenant = Tenant::create($attrs);
        if ($target === TenantLifecycle::ACTIVE) {
            $tenant->transitionTo(TenantLifecycle::ACTIVE);
        }

        return $tenant;
    }

    public function test_directory_lists_active_providers_only(): void
    {
        $this->provider(['name' => 'Acme Services', 'slug' => 'acme', 'description' => 'Repairs & installs', 'status' => TenantLifecycle::ACTIVE]);
        $this->provider(['name' => 'Dormant Co', 'slug' => 'dormant']);            // pending
        $this->provider(['name' => 'Suspended Co', 'slug' => 'suspended', 'status' => TenantLifecycle::SUSPENDED]);

        $response = $this->getJson('/api/v1/providers');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.slug', 'acme')
            ->assertJsonPath('data.0.name', 'Acme Services')
            ->assertJsonPath('data.0.description', 'Repairs & installs')
            // Public surface: no ids, plan, or lifecycle state leak out.
            ->assertJsonMissingPath('data.0.id')
            ->assertJsonMissingPath('data.0.status')
            ->assertJsonMissingPath('data.0.plan_id');
    }

    public function test_directory_search_matches_name_and_slug(): void
    {
        $this->provider(['name' => 'Acme Services', 'slug' => 'acme', 'status' => TenantLifecycle::ACTIVE]);
        $this->provider(['name' => 'Bright Fix', 'slug' => 'brightfix', 'status' => TenantLifecycle::ACTIVE]);

        $this->getJson('/api/v1/providers?q=acm')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'acme');

        $this->getJson('/api/v1/providers?q=bright')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'brightfix');

        $this->getJson('/api/v1/providers?q=nothing-matches')
            ->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_show_resolves_active_provider_by_slug(): void
    {
        $this->provider(['name' => 'Acme Services', 'slug' => 'acme', 'description' => 'Repairs & installs', 'status' => TenantLifecycle::ACTIVE]);

        $this->getJson('/api/v1/providers/acme')
            ->assertOk()
            ->assertJsonPath('data.slug', 'acme')
            ->assertJsonPath('data.name', 'Acme Services')
            ->assertJsonMissingPath('data.id');
    }

    public function test_show_rejects_unknown_and_inactive_slugs(): void
    {
        $this->provider(['name' => 'Pending Co', 'slug' => 'pending-co']);           // stays pending

        $this->getJson('/api/v1/providers/pending-co')->assertNotFound();
        $this->getJson('/api/v1/providers/no-such-provider')->assertNotFound();
    }
}
