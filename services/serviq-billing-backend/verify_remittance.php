<?php
/**
 * End-to-end check of the hardened billing/remittance flow.
 * Boots the app on sqlite, mints HS256 test JWTs, and drives the real
 * HTTP kernel through every scenario in CASH_REMITTANCE.MD.
 * Run: php verify_remittance.php   (inside a php:8.4 container, bind-mounted)
 */

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentEvidence;
use App\Models\Remittance;
use Firebase\JWT\JWT;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$kernel->bootstrap();
Artisan::call('migrate:fresh', ['--force' => true]);

$PASS = 0; $FAIL = 0;
function check(string $name, bool $cond, $ctx = null): void {
    global $PASS, $FAIL;
    if ($cond) { $PASS++; echo "  PASS  $name\n"; }
    else { $FAIL++; echo "  FAIL  $name   ".json_encode($ctx)."\n"; }
}

function jwt(string $tenant): string {
    return JWT::encode([
        'iss' => 'serviq-iam', 'aud' => 'serviq',
        'sub' => (string) Illuminate\Support\Str::uuid7(),
        'tenant_id' => $tenant, 'roles' => ['Dispatcher'], 'permissions' => [],
        'jti' => (string) Illuminate\Support\Str::uuid(), 'iat' => time(), 'exp' => time() + 3600,
    ], env('JWT_SECRET'), 'HS256');
}

function hit($kernel, string $method, string $uri, ?array $body, string $token): array {
    $req = Request::create($uri, $method, [], [], [], [
        'HTTP_AUTHORIZATION' => "Bearer $token",
        'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
    ], $body === null ? null : json_encode($body));
    $res = $kernel->handle($req);
    return [$res->getStatusCode(), json_decode($res->getContent(), true)];
}

function invoice(string $tenant, ?string $agent, int $cents): Invoice {
    return Invoice::create([
        'job_id' => (string) Illuminate\Support\Str::uuid7(), 'tenant_id' => $tenant,
        'customer_id' => (string) Illuminate\Support\Str::uuid7(), 'agent_id' => $agent,
        'status' => 'issued', 'amount_cents' => $cents,
    ]);
}

$T = (string) Illuminate\Support\Str::uuid7();
$AGENT = (string) Illuminate\Support\Str::uuid7();
$TOKEN = jwt($T);
$api = fn ($m, $u, $b = null) => hit($kernel, $m, "/api/v1/tenants/$T$u", $b, $TOKEN);

echo "== payment evidence intake ==\n";
$inv = invoice($T, null, 150000);
[$s, $r] = $api('POST', '/payment-evidence', [
    'document_type' => 'E_WALLET', 'file_ref' => 'minio://ev/1',
    'confidence' => 0.95, 'invoice_id' => $inv->id,
    'extracted' => ['reference' => 'GC-1001', 'amount_cents' => 150000, 'channel' => 'gcash'],
]);
check('e-wallet evidence accepted', $s === 201 && $r['data']['status'] === 'accepted', [$s, $r]);
check('invoice paid via evidence', $inv->fresh()->status === 'paid');
check('payment carries evidence ref', Payment::where('invoice_id', $inv->id)->where('evidence_id', $r['data']['id'] ?? '')->exists());

[$s, $r] = $api('POST', '/payment-evidence', [
    'document_type' => 'E_WALLET', 'file_ref' => 'minio://ev/2', 'confidence' => 0.9,
    'extracted' => ['reference' => 'GC-1001', 'amount_cents' => 150000],
]);
check('duplicate reference flagged', $s === 201 && $r['data']['status'] === 'flagged' && in_array('duplicate_reference', $r['data']['flags'] ?? []), [$s, $r]);
$flaggedId = $r['data']['id'] ?? null;

$inv2 = invoice($T, null, 150000);
[$s, $r] = $api('POST', '/payment-evidence', [
    'document_type' => 'E_WALLET', 'file_ref' => 'minio://ev/3', 'confidence' => 0.92,
    'invoice_id' => $inv2->id,
    'extracted' => ['reference' => 'GC-2002', 'amount_cents' => 100000],
]);
check('under-remitted flagged', $s === 201 && in_array('under_remitted', $r['data']['flags'] ?? []), [$s, $r]);
check('flagged evidence does not pay invoice', $inv2->fresh()->status === 'issued');

[$s, $r] = $api('POST', '/payment-evidence', [
    'document_type' => 'POS_RECEIPT', 'file_ref' => 'minio://ev/4', 'confidence' => 0.3,
    'extracted' => ['reference' => 'POS-9', 'amount_cents' => 5000],
]);
check('low confidence flagged', $s === 201 && in_array('low_confidence', $r['data']['flags'] ?? []));

[$s, $r] = $api('GET', '/payment-evidence?status=flagged');
check('manual review queue lists flagged', $s === 200 && count($r['data'] ?? []) >= 3, [$s]);

[$s, $r] = $api('POST', "/payment-evidence/$flaggedId/review", ['decision' => 'reject', 'notes' => 'dup']);
check('review reject works', $s === 200 && $r['data']['status'] === 'rejected', [$s, $r]);

echo "== direct pay + dup-ref guard ==\n";
$inv3 = invoice($T, null, 50000);
[$s, $r] = $api('POST', "/invoices/{$inv3->id}/pay", ['method' => 'cash', 'reference' => 'REF-A']);
check('pay records payment', $s === 201, [$s, $r]);
$inv4 = invoice($T, null, 60000);
[$s, $r] = $api('POST', "/invoices/{$inv4->id}/pay", ['method' => 'cash', 'reference' => 'REF-A']);
check('duplicate reference rejected 409', $s === 409, [$s, $r]);

echo "== cash turn-in ==\n";
$c1 = invoice($T, $AGENT, 150000); $c2 = invoice($T, $AGENT, 100000);
$api('POST', "/invoices/{$c1->id}/pay", ['method' => 'cash']);
$api('POST', "/invoices/{$c2->id}/pay", ['method' => 'cash']);
$other = invoice($T, null, 77700); $api('POST', "/invoices/{$other->id}/pay", ['method' => 'cash']);

[$s, $r] = $api('GET', "/remittances/expected?agent_id=$AGENT");
check('expected sums only this agent\'s cash', $s === 200 && $r['data']['expected_cents'] === 250000 && count($r['data']['collections']) === 2, [$s, $r]);

[$s, $r] = $api('POST', '/remittances/turn-ins', ['agent_id' => $AGENT, 'counted_total_cents' => 250000]);
check('turn-in matched → pending', $s === 201 && $r['data']['status'] === 'pending_confirmation' && $r['data']['variance_cents'] === 0, [$s, $r]);
$turn1 = $r['data']['id'];
[$s, $r] = $api('POST', "/remittances/$turn1/confirm", ['decision' => 'confirm']);
check('confirm → remitted', $s === 200 && $r['data']['status'] === 'remitted', [$s, $r]);
check('covered invoices remitted', $c1->fresh()->status === 'remitted' && $c2->fresh()->status === 'remitted');

$AGENT2 = (string) Illuminate\Support\Str::uuid7();
$c3 = invoice($T, $AGENT2, 200000);
$api('POST', "/invoices/{$c3->id}/pay", ['method' => 'cash']);
[$s, $r] = $api('POST', '/remittances/turn-ins', ['agent_id' => $AGENT2, 'counted_total_cents' => 190000]);
check('short turn-in has variance', $s === 201 && $r['data']['variance_cents'] === -10000, [$s, $r]);
$turn2 = $r['data']['id'];
[$s, $r] = $api('POST', "/remittances/$turn2/confirm", ['decision' => 'confirm']);
check('variance confirm rejected', $s === 422, [$s, $r]);
[$s, $r] = $api('POST', "/remittances/$turn2/confirm", ['decision' => 'accept_shortfall', 'notes' => 'agent short']);
check('accept_shortfall → remitted', $s === 200 && $r['data']['status'] === 'remitted', [$s, $r]);
check('shortfall event in outbox', DB::table('outbox')->where('type', 'Remittance.ShortfallAccepted')->where('payload->remittance_id', $turn2)->exists());

echo "== deposit-slip batch ==\n";
$d1 = invoice($T, $AGENT, 80000); $d2 = invoice($T, $AGENT, 70000);
$api('POST', "/invoices/{$d1->id}/pay", ['method' => 'cash']);
$api('POST', "/invoices/{$d2->id}/pay", ['method' => 'cash']);
[$s, $r] = $api('POST', '/payment-evidence', [
    'document_type' => 'BANK_SLIP', 'file_ref' => 'minio://slip/1', 'confidence' => 0.97,
    'extracted' => ['reference' => 'DEP-555', 'amount_cents' => 150000],
]);
$slipId = $r['data']['id'] ?? null;
check('deposit slip evidence stored', $s === 201 && $r['data']['status'] === 'accepted', [$s, $r]);
[$s, $r] = $api('POST', '/remittances/batches', ['evidence_id' => $slipId, 'invoice_ids' => [$d1->id, $d2->id]]);
check('batch pending on clean slip', $s === 201 && $r['data']['status'] === 'pending_confirmation', [$s, $r]);
$batch = $r['data']['id'];
[$s, $r] = $api('POST', "/remittances/$batch/confirm", ['decision' => 'confirm']);
check('batch confirm → remitted', $s === 200 && $r['data']['status'] === 'remitted', [$s, $r]);
check('batch covers invoices', $d1->fresh()->status === 'remitted' && $d2->fresh()->status === 'remitted');

[$s, $r] = $api('POST', '/payment-evidence', [
    'document_type' => 'BANK_SLIP', 'file_ref' => 'minio://slip/2', 'confidence' => 0.96,
    'extracted' => ['reference' => 'DEP-555', 'amount_cents' => 150000],
]);
check('reused slip ref flagged at intake', $s === 201 && in_array('duplicate_reference', $r['data']['flags'] ?? []), [$s, $r]);

$d3 = invoice($T, $AGENT, 40000); $api('POST', "/invoices/{$d3->id}/pay", ['method' => 'cash']);
[$s, $r] = $api('POST', '/remittances/batches', ['evidence_id' => $slipId, 'invoice_ids' => [$d3->id]]);
check('reused slip ref → batch manual_review', $s === 201 && $r['data']['status'] === 'manual_review' && in_array('duplicate_reference', $r['data']['flags'] ?? []), [$s, $r]);
$flaggedBatch = $r['data']['id'];
[$s, $r] = $api('POST', "/remittances/$flaggedBatch/confirm", ['decision' => 'override', 'notes' => 'verified at bank']);
check('manual review override remits', $s === 200 && $r['data']['status'] === 'remitted' && $r['data']['overridden_by'] !== null, [$s, $r]);

echo "== digital bulk remit ==\n";
$w1 = invoice($T, null, 90000);
$api('POST', "/invoices/{$w1->id}/pay", ['method' => 'wallet', 'reference' => 'W-1']);
[$s, $r] = $api('POST', '/remittances/digital', ['invoice_ids' => [$w1->id]]);
check('digital mark remitted immediately', $s === 201 && $r['data']['status'] === 'remitted' && $r['data']['kind'] === 'digital', [$s, $r]);
check('digital invoice remitted', $w1->fresh()->status === 'remitted');

$cashOnly = invoice($T, null, 30000); $api('POST', "/invoices/{$cashOnly->id}/pay", ['method' => 'cash']);
[$s, $r] = $api('POST', '/remittances/digital', ['invoice_ids' => [$cashOnly->id]]);
check('cash invoice rejected from digital set', $s === 422, [$s, $r]);

echo "== claimed vs parsed ==\n";
[$s, $r] = $api('POST', '/payment-evidence', [
    'document_type' => 'E_WALLET', 'file_ref' => 'minio://ev/c1', 'confidence' => 0.95,
    'extracted' => ['reference' => 'PARSED-1', 'amount_cents' => 150000],
    'claimed' => ['reference' => 'WRONG-1', 'amount_cents' => 150000],
]);
check('claimed mismatch flagged', $s === 201 && in_array('claimed_mismatch', $r['data']['flags'] ?? []), [$s, $r]);

[$s, $r] = $api('POST', '/payment-evidence', [
    'document_type' => 'E_WALLET', 'file_ref' => 'minio://ev/c2', 'confidence' => 0.95,
    'extracted' => ['reference' => 'MATCH-1', 'amount_cents' => 150000],
    'claimed' => ['reference' => 'match-1', 'amount_cents' => 150000],   // case-insensitive match
]);
check('matching claim accepted', $s === 201 && $r['data']['status'] === 'accepted', [$s, $r]);

echo "== outbox audit ==\n";
check('TurnInSubmitted events', DB::table('outbox')->where('type', 'Remittance.TurnInSubmitted')->count() >= 2);
check('BatchSubmitted event', DB::table('outbox')->where('type', 'Remittance.BatchSubmitted')->exists());
check('Remittance.Confirmed events', DB::table('outbox')->where('type', 'Remittance.Confirmed')->count() >= 4);
check('Evidence events', DB::table('outbox')->where('type', 'PaymentEvidence.Received')->count() >= 5);
check('confirmed_by stamped', Remittance::find($turn1)->confirmed_by !== null);

echo "\n=== $PASS passed, $FAIL failed ===\n";
exit($FAIL === 0 ? 0 : 1);
