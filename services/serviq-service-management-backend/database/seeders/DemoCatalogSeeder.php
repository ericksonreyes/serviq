<?php

namespace Database\Seeders;

use App\Models\CatalogService;
use App\Services\DomainEventRecorder;
use Illuminate\Database\Seeder;

/**
 * Demo catalog for the "Acme Services" tenant (root README's Local seed accounts section).
 * DEMO_TENANT_ID matches DemoTenantSeeder's fixed UUID in
 * platform-management — demo rows are keyed on it, no cross-DB lookups.
 * Idempotent via (tenant_id, name); workflow steps seed on first creation.
 */
class DemoCatalogSeeder extends Seeder
{
    public const DEMO_TENANT_ID = '01ac0000-0000-7000-8000-00000000acde';

    private const CATALOG = [
        [
            'name' => 'Aircon Cleaning',
            'description' => 'Split-type aircon cleaning and maintenance',
            'price_cents' => 150000,
            'currency' => 'PHP',
            'estimated_minutes' => 90,
            'required_skills' => ['ac-cleaning'],
            'service_areas' => ['Antipolo', 'Cainta'],
            'steps' => [
                ['position' => 1, 'name' => 'Inspect unit', 'required_evidence' => []],
                ['position' => 2, 'name' => 'Clean filters and coils', 'required_evidence' => ['photo']],
                ['position' => 3, 'name' => 'Test unit and sign-off', 'required_evidence' => ['signature']],
            ],
        ],
        [
            'name' => 'Plumbing Repair',
            'description' => 'Leak repair, fixture replacement, unclogging',
            'price_cents' => 250000,
            'currency' => 'PHP',
            'estimated_minutes' => 120,
            'required_skills' => ['plumbing'],
            'service_areas' => ['Antipolo', 'Cainta'],
            'steps' => [
                ['position' => 1, 'name' => 'Assess damage', 'required_evidence' => ['photo']],
                ['position' => 2, 'name' => 'Repair or replace parts', 'required_evidence' => []],
                ['position' => 3, 'name' => 'Pressure test and sign-off', 'required_evidence' => ['signature']],
            ],
        ],
        [
            'name' => 'Home Deep Cleaning',
            'description' => 'Full-house deep clean, 2-person crew',
            'price_cents' => 350000,
            'currency' => 'PHP',
            'estimated_minutes' => 240,
            'required_skills' => ['deep-cleaning'],
            'service_areas' => ['Antipolo', 'Cainta'],
            'steps' => [
                ['position' => 1, 'name' => 'Walkthrough', 'required_evidence' => []],
                ['position' => 2, 'name' => 'Deep clean all rooms', 'required_evidence' => ['photo']],
                ['position' => 3, 'name' => 'Final inspection', 'required_evidence' => ['signature']],
            ],
        ],
    ];

    public function run(): void
    {
        foreach (self::CATALOG as $data) {
            $steps = $data['steps'];
            unset($data['steps']);

            $service = CatalogService::firstOrCreate(
                ['tenant_id' => self::DEMO_TENANT_ID, 'name' => $data['name']],
                $data + ['active' => true],
            );

            if ($service->wasRecentlyCreated) {
                $service->workflowSteps()->createMany($steps);

                // The job-mgmt service_templates projection only fills from
                // the event stream — seeded rows must emit it too, else demo
                // jobs fall back to the Booked/Serviced placeholder steps.
                app(DomainEventRecorder::class)->record('ServiceManagement.ServiceCreated', [
                    'service_id' => $service->id,
                    'name' => $service->name,
                    'steps' => $service->workflowSteps->map(fn ($s) => [
                        'name' => $s->name,
                        'position' => $s->position,
                        'required_evidence' => $s->required_evidence,
                    ])->all(),
                ], $service->tenant_id);
            }
        }
    }
}
