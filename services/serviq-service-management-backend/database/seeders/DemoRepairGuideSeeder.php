<?php

namespace Database\Seeders;

use App\Models\RepairGuide;
use Illuminate\Database\Seeder;

/**
 * Demo repair guides for the "Acme Services" tenant — same fixed
 * DEMO_TENANT_ID as DemoCatalogSeeder. Idempotent via (tenant_id, title).
 */
class DemoRepairGuideSeeder extends Seeder
{
    private const DEMO_TENANT_ID = '01ac0000-0000-7000-8000-00000000acde';

    private const GUIDES = [
        [
            'title' => 'Aircon not cooling — first checks',
            'body' => "Before booking a visit:\n1. Confirm the unit is set to COOL and the thermostat is below room temperature.\n2. Clean or wash the filters — clogged filters are the most common cause of weak cooling.\n3. Check the outdoor unit is free of obstructions and the breaker has not tripped.\nIf the unit still blows warm air or ices up, book a cleaning or repair visit.",
            'tags' => ['aircon', 'cooling', 'troubleshooting'],
        ],
        [
            'title' => 'Leaking faucet or pipe under the sink',
            'body' => "1. Close the shut-off valve under the sink (turn clockwise).\n2. Place a bucket under the trap and note where the drip originates — supply line, drain, or faucet base.\n3. Do not use the fixture until repaired if the leak is on a pressurized line.\nA photo of the leak location helps the technician bring the right parts.",
            'tags' => ['plumbing', 'leak', 'emergency'],
        ],
        [
            'title' => 'Preparing for a deep cleaning visit',
            'body' => "To get the most from the crew's time:\n1. Declutter floors and surfaces you want cleaned.\n2. Secure pets and note any areas that need special care (antiques, electronics).\n3. Point out stains or problem areas at the walkthrough — they set the work plan there.",
            'tags' => ['cleaning', 'preparation'],
        ],
        [
            'title' => 'Breaker trips when the aircon starts',
            'body' => "A tripping breaker usually means an overloaded circuit or a failing compressor capacitor.\n1. Try the unit on a dedicated outlet if it is a window type.\n2. Do NOT upsize the breaker — that is a fire hazard.\nBook an inspection; the technician will test the capacitor and amp draw.",
            'tags' => ['aircon', 'electrical', 'safety'],
        ],
        [
            'title' => 'Low water pressure in one fixture',
            'body' => "1. Unscrew the faucet aerator or showerhead and soak it in vinegar overnight — mineral buildup is the usual cause.\n2. If pressure is low everywhere, check the main valve is fully open.\n3. Pressure that dropped suddenly across the whole house can mean a hidden leak — book a plumbing visit.",
            'tags' => ['plumbing', 'water-pressure'],
        ],
    ];

    public function run(): void
    {
        foreach (self::GUIDES as $data) {
            RepairGuide::firstOrCreate(
                ['tenant_id' => self::DEMO_TENANT_ID, 'title' => $data['title']],
                $data,
            );
        }
    }
}
