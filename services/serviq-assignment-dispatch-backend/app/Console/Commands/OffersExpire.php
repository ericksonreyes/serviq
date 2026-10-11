<?php

namespace App\Console\Commands;

use App\Models\Assignment;
use App\Services\DomainEventRecorder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Offer expiration sweep — tiered timeouts turn into `expired` offers. */
class OffersExpire extends Command
{
    protected $signature = 'offers:expire {--sleep=5}';

    public function handle(DomainEventRecorder $events): int
    {
        $sleep = (int) $this->option('sleep');
        $this->info("Offer expiry sweep every {$sleep}s");

        while (true) {
            $expired = Assignment::where('status', Assignment::OFFERED)
                ->whereNotNull('expires_at')
                ->where('expires_at', '<=', now())
                ->get();

            foreach ($expired as $offer) {
                DB::transaction(function () use ($offer, $events) {
                    Assignment::where('id', $offer->id)->where('status', Assignment::OFFERED)
                        ->update(['status' => Assignment::EXPIRED]);
                    $events->record('Assignment.OfferExpired', [
                        'job_id' => $offer->job_id,
                        'agent_id' => $offer->agent_id,
                        'assignment_id' => $offer->id,
                    ], $offer->tenant_id);
                });
            }

            sleep($sleep);
        }
    }
}
