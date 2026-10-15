<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Event sourcing for payouts (SERVICE_STACKS.MD) — payout_events is
     * the source of truth; payouts stays as the folded projection.
     * Existing rows backfill into synthesized streams so replay
     * reconstructs every payout.
     */
    public function up(): void
    {
        Schema::create('payout_events', function (Blueprint $table) {
            $table->id();
            $table->uuid('payout_id')->index();
            $table->unsignedInteger('seq');
            $table->string('type');
            $table->jsonb('payload');
            $table->timestamps();
            $table->unique(['payout_id', 'seq']);
        });

        Schema::table('payouts', function (Blueprint $table) {
            $table->integer('version')->default(0);
        });

        foreach (DB::table('payouts')->orderBy('created_at')->get() as $row) {
            $created = $row->status === 'deduction' ? 'Payout.ShortfallRecorded' : 'Payout.Created';
            DB::table('payout_events')->insert([
                'payout_id' => $row->id, 'seq' => 1, 'type' => $created,
                'payload' => json_encode([
                    'agent_id' => $row->agent_id, 'net_cents' => $row->net_cents,
                    'shortfall_cents' => $row->shortfall_cents,
                    'reference' => $row->disbursement_ref,
                ]),
                'created_at' => $row->created_at, 'updated_at' => $row->created_at,
            ]);
            if ($row->applied_cents > 0) {
                DB::table('payout_events')->insert([
                    'payout_id' => $row->id, 'seq' => 2, 'type' => 'Payout.ShortfallApplied',
                    'payload' => json_encode(['amount_cents' => $row->applied_cents]),
                    'created_at' => $row->updated_at, 'updated_at' => $row->updated_at,
                ]);
            }
            if ($row->status === 'settled') {
                DB::table('payout_events')->insert([
                    'payout_id' => $row->id, 'seq' => $row->applied_cents > 0 ? 3 : 2,
                    'type' => 'Payout.Settled',
                    'payload' => json_encode(['reference' => $row->disbursement_ref]),
                    'created_at' => $row->updated_at, 'updated_at' => $row->updated_at,
                ]);
            }
            DB::table('payouts')->where('id', $row->id)
                ->update(['version' => DB::table('payout_events')->where('payout_id', $row->id)->count()]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('payout_events');
        Schema::table('payouts', function (Blueprint $table) {
            $table->dropColumn('version');
        });
    }
};
