<?php

namespace App\Events\Handlers;

use App\Domain\Payouts\PayoutPolicy;
use App\Models\Payout;
use App\Models\PayoutJob;
use App\Services\DomainEventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Job.* + Invoice.* projections → create agent payouts on Invoice.Issued.
 * Support.RefundDecided against a paid invoice creates a shortfall
 * deduction on the next payout (ADR-0005 clawback ledger).
 */
class PayoutEventHandler
{
    public function __construct(private PayoutPolicy $policy, private DomainEventRecorder $events) {}

    public function handle(array $envelope): void
    {
        $p = $envelope['payload'] ?? [];
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
                $payout = Payout::create([
                    'job_id' => $job->job_id, 'tenant_id' => $job->tenant_id,
                    'agent_id' => $job->agent_id, 'amount_cents' => $gross,
                    'shortfall_cents' => $shortfall,
                    'net_cents' => $this->policy->net($gross, $shortfall),
                    'status' => 'pending',
                ]);
                if ($shortfall > 0) {
                    // mark shortfalls as applied up to this payout
                    Payout::where('agent_id', $job->agent_id)
                        ->whereColumn('shortfall_cents', '>', 'applied_cents')
                        ->update(['applied_cents' => DB::raw('shortfall_cents')]);
                }
                $this->events->record('Payout.Created', [
                    'payout_id' => $payout->id, 'job_id' => $job->job_id,
                    'agent_id' => $job->agent_id, 'net_cents' => $payout->net_cents,
                ], $job->tenant_id);

                return $payout;
            });
            Log::info("Payout {$payout->id} created for agent {$job->agent_id}");
        }
    }
}
