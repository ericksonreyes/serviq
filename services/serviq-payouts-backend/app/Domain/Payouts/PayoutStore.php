<?php

namespace App\Domain\Payouts;

use App\Models\Payout;
use App\Models\PayoutEvent;
use App\Services\DomainEventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Payout event sourcing — append events, fold onto the projection.
 * Mirrors Billing's InvoiceStore: payout_events is the truth, the
 * payouts row is rebuildable state (SERVICE_STACKS.MD).
 */
class PayoutStore
{
    private const EVENT_STATUS = [
        'Payout.Created' => 'pending',
        'Payout.ShortfallRecorded' => 'deduction',
        'Payout.Settled' => 'settled',
    ];

    public function __construct(private DomainEventRecorder $events) {}

    /** Open a new stream — the type leads so emit sites read as domain events. */
    public function create(string $type, array $attrs, array $payload): Payout
    {
        return DB::transaction(function () use ($attrs, $type, $payload) {
            $payout = Payout::create($attrs + ['status' => self::EVENT_STATUS[$type] ?? 'pending']);
            PayoutEvent::create(['payout_id' => $payout->id, 'seq' => 1, 'type' => $type, 'payload' => $payload]);
            $payout->update(['version' => 1]);
            $this->events->record($type, $payload + ['payout_id' => $payout->id], $payout->tenant_id);

            return $payout;
        });
    }

    /** Append to an existing stream, fold onto the projection, emit to the broker. */
    public function record(Payout $payout, string $type, array $payload): Payout
    {
        return DB::transaction(function () use ($payout, $type, $payload) {
            Payout::where('id', $payout->id)->lockForUpdate()->first();
            $seq = PayoutEvent::where('payout_id', $payout->id)->max('seq') + 1;
            PayoutEvent::create(['payout_id' => $payout->id, 'seq' => $seq, 'type' => $type, 'payload' => $payload]);
            $this->apply($payout, $type, $payload);
            $this->events->record($type, $payload + ['payout_id' => $payout->id], $payout->tenant_id);

            return $payout->fresh();
        });
    }

    /** Rebuild the projection by folding the stream — source-of-truth check. */
    public function replay(Payout $payout): Payout
    {
        $attrs = ['applied_cents' => 0];
        foreach (PayoutEvent::where('payout_id', $payout->id)->orderBy('seq')->get() as $e) {
            if (isset(self::EVENT_STATUS[$e->type])) {
                $attrs['status'] = self::EVENT_STATUS[$e->type];
            }
            if ($e->type === 'Payout.Settled') {
                $attrs['disbursement_ref'] = $e->payload['disbursement_ref'] ?? $payout->disbursement_ref;
            }
            if ($e->type === 'Payout.ShortfallApplied') {
                $attrs['applied_cents'] = $payout->shortfall_cents;
            }
        }
        $payout->update($attrs);

        return $payout->fresh();
    }

    private function apply(Payout $payout, string $type, array $payload): void
    {
        $attrs = ['version' => $payout->version + 1];
        if (isset(self::EVENT_STATUS[$type])) {
            $attrs['status'] = self::EVENT_STATUS[$type];
        }
        if ($type === 'Payout.Settled') {
            $attrs['disbursement_ref'] = $payload['disbursement_ref'] ?? $payout->disbursement_ref;
        }
        if ($type === 'Payout.ShortfallApplied') {
            $attrs['applied_cents'] = $payout->shortfall_cents;
        }
        $payout->update($attrs);
    }
}
