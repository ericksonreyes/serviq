<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // AI-parsed payment/remittance evidence — BILLING.MD "Proof of
        // Payment Intake". The AI Agent classifies/extracts; Billing
        // validates, flags, and stores. Evidence alone never settles.
        Schema::create('payment_evidence', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('uploader_id')->nullable();
            $table->string('document_type');          // E_WALLET|BANK_SLIP|BANK_CHECK|POS_RECEIPT|PURCHASE_ORDER|CASH_PHOTO|OTHER
            $table->string('file_ref');
            $table->text('raw_text')->nullable();
            $table->jsonb('extracted');               // reference, amount_cents, channel, payer_name, paid_at, ...
            $table->decimal('confidence', 3, 2)->nullable();
            $table->string('status')->default('accepted'); // accepted | flagged | rejected
            $table->jsonb('flags')->nullable();       // duplicate_reference | under_remitted | low_confidence
            $table->uuid('invoice_id')->nullable()->index();
            $table->uuid('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_notes')->nullable();
            $table->timestamps();
        });

        // Agent attribution for expected-cash computation (CASH_REMITTANCE).
        Schema::table('invoices', function (Blueprint $table) {
            $table->uuid('agent_id')->nullable()->index()->after('customer_id');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->uuid('evidence_id')->nullable()->index()->after('reference');
        });

        // Remittance hardening: three kinds (cash turn-in, deposit-slip
        // batch, digital bulk-mark), expected-vs-counted, human confirm.
        Schema::table('remittances', function (Blueprint $table) {
            $table->string('kind')->default('turn_in')->after('tenant_id'); // turn_in | deposit_batch | digital
            $table->uuid('agent_id')->nullable()->index()->after('kind');
            $table->string('reference')->nullable()->after('agent_id');     // deposit slip reference (batches)
            $table->integer('expected_cents')->default(0)->after('total_cents');
            $table->integer('counted_cents')->nullable()->after('expected_cents');
            $table->integer('variance_cents')->default(0)->after('counted_cents');
            $table->uuid('evidence_id')->nullable()->after('variance_cents');
            $table->jsonb('flags')->nullable()->after('evidence_id');       // duplicate_reference | under_remitted | low_confidence
            $table->string('decision')->nullable()->after('flags');         // confirm | override | accept_shortfall | reject
            $table->text('decision_notes')->nullable()->after('decision');
            $table->uuid('confirmed_by')->nullable()->after('decision_notes');
            $table->uuid('overridden_by')->nullable()->after('confirmed_by');
        });
    }

    public function down(): void
    {
        Schema::table('remittances', function (Blueprint $table) {
            $table->dropColumn(['kind', 'agent_id', 'reference', 'expected_cents', 'counted_cents',
                'variance_cents', 'evidence_id', 'flags', 'decision', 'decision_notes', 'confirmed_by', 'overridden_by']);
        });
        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn('evidence_id');
        });
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn('agent_id');
        });
        Schema::dropIfExists('payment_evidence');
    }
};
