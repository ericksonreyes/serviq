<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Reference hierarchy seed — PH rows come from the PSGC (PSA) export,
 * transformed to (code, name, level, parent_code, country) in
 * database/data/locations_ph.csv. Idempotent: upserts by code, safe on
 * every container start.
 */
class LocationsSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('data/locations_ph.csv');
        if (! is_file($path)) return;

        $handle = fopen($path, 'r');
        fgetcsv($handle); // header

        $now = now();
        $batch = [];
        while (($row = fgetcsv($handle)) !== false) {
            $batch[] = [
                'code' => $row[0],
                'name' => $row[1],
                'level' => $row[2],
                'parent_code' => $row[3] ?: null,
                'country' => $row[4],
                'created_at' => $now,
                'updated_at' => $now,
            ];
            if (count($batch) >= 500) {
                DB::table('locations')->upsert($batch, 'code', ['name', 'level', 'parent_code', 'country', 'updated_at']);
                $batch = [];
            }
        }
        if ($batch) {
            DB::table('locations')->upsert($batch, 'code', ['name', 'level', 'parent_code', 'country', 'updated_at']);
        }
        fclose($handle);
    }
}
