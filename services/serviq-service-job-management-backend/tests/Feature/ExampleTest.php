<?php

namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_health_endpoint_is_public(): void
    {
        $response = $this->get('/api/health');

        $response->assertStatus(200)->assertJson(['service' => 'serviq-service-job-management-backend']);
    }
}
