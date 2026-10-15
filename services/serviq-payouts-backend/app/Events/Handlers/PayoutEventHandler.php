<?php

namespace App\Events\Handlers;

use App\Domain\Payouts\PayoutPolicy;
use App\Domain\Payouts\PayoutStore;
use App\Models\Payout;
use App\Models\PayoutJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Job.* + Invoice.* projections → create agent payouts on Invoice.Issued.
 * Remittance.ShortfallAccepted records a deduction adjustment on the
 * agent's share of the next payout (ADR-0005 clawback ledger).
 * All payout writes go through PayoutStore — the stream is the truth.
 */
class PayoutEventHandler
{
    public function __construct(private PayoutPolicy $policy, private PayoutStore $store) {}

    public function handle(array $envelope): void
    {
        $p = $envelope['payload'] ?? [];

        // Cash turn-in accepted below expected → deduction row on the
        // agent's ledger; the next payout absorbs it via shortfall_cents.
        if ($envelope['type'] === 'Remittance.ShortfallAccepted') {
            $shortage = (int) ($p['shortage_cents'] ?? 0);
            if ($shortage <= 0 || empty($p['agent_id'])) {
                return;
            }
            if (! empty($p['remittance_id']) && Payout::where('disbursement_ref', 'remit:'.$p['remittance_id'])->exists()) {
                return; // idempotent — same shortfall never deducts twice
            }
            $this->store->create('Payout.ShortfallRecorded', [
                'job_id' => null, 'tenant_id' => $envelope['tenant_id'],
                'agent_id' => $p['agent_id'], 'amount_cents' => 0,
                'shortfall_cents' => $shortage, 'net_cents' => 0,
                'disbursement_ref' => 'remit:'.($p['remittance_id'] ?? ''),
            ], [
                'remittance_id' => $p['remittance_id'] ?? null,
                'agent_id' => $p['agent_id'], 'shortage_cents' => $shortage,
            ]);
            Log::info("Shortfall {$shortage} recorded against agent {$p['agent_id']}");

            return;
        }

        $jobId = $p['job_id'] ?? null;

        if ($envelope['type'] === 'Assignment.Accepted' && $jobId !== null) {
            PayoutJob::updateOrCreate(
                ['job_id' => $jobId],
                ['tenant_id' => $envelope['tenant_id'], 'agent_id' => $p['agent_id'], 'job_status' => 'assigned'],
            );

            return;
        }

        if ($envelope['type'] === 'Invoice.Issued' && $jobId !== null) {
            $job = PayoutJob::find($jobId);
            if ($job === null || $job->agent_id === null || Payout::where('job_id', $jobId)->exists()) {
                return;
            }
            $gross = $this->policy->gross($p['amount_cents'] ?? 0);
            // Apply outstanding shortfalls from prior refunds.
            $shortfall = Payout::where('agent_id', $job->agent_id)
                ->whereColumn('shortfall_cents', '>', 'applied_cents')
                ->sum(DB::raw('shortfall_cents - applied_cents'));

            $payout = DB::transaction(function () use ($job, $gross, $shortfall) {
                $payout = $this->store->create('Payout.Created', [
                    'job_id' => $job->job_id, 'tenant_id' => $job->tenant_id,
                    'agent_id' => $job->agent_id, 'amount_cents' => $gross,
                    'shortfall_cents' => $shortfall,
                    'net_cents' => $this->policy->net($gross, $shortfall),
                ], [
                    'job_id' => $job->job_id, 'agent_id' => $job->agent_id,
                    'net_cents' => $this->policy->net($gross, $shortfall),
                    'shortfall_cents' => $shortfall,
                ]);
                if ($shortfall > 0) {
                    // Every absorbed shortfall gets its own stream event —
                    // the deduction aggregates fold it into applied_cents.
                    Payout::where('agent_id', $job->agent_id)
                        ->whereColumn('shortfall_cents', '>', 'applied_cents')
                        ->get()
                        ->each(fn (Payout $prior) => $this->store->record($prior, 'Payout.ShortfallApplied', [
                            'absorbed_by' => $payout->id,
                            'amount_cents' => $prior->shortfall_cents - $prior->applied_cents,
                        ]));
                }

                return $payout;
            });
            Log::info("Payout {$payout->id} created for agent {$job->agent_id}");
        }
    }
}
