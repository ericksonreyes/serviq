<?php

namespace Database\Seeders;

use App\Models\NotificationTemplate;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /** System default templates — tenant overrides win at dispatch time. */
    public function run(): void
    {
        $defaults = [
            ['Job.Requested', 'Service request received', 'We received your request {{request_id}}.'],
            ['Job.Assigned', 'An agent was assigned', '{{agent_id}} has been assigned to your job {{job_id}}.'],
            ['Job.Started', 'Work started', 'Work has started on job {{job_id}}.'],
            ['Job.WorkflowStepStarted', 'Step started: {{step_name}}', 'Job {{job_id}} is now at "{{step_name}}".'],
            ['Job.WorkflowStepCompleted', 'Step done: {{step_name}}', 'Job {{job_id}} finished "{{step_name}}".'],
            ['Job.Completed', 'Job completed', 'Job {{job_id}} is complete. Thank you!'],
            ['Job.Cancelled', 'Job cancelled', 'Job {{job_id}} was cancelled.'],
            ['Request.Submitted', 'Request submitted', 'Your request {{request_id}} was submitted.'],
            ['Assignment.Offered', 'New job offer', 'Job {{job_id}} is offered to you.'],
            ['Assignment.Accepted', 'Assignment accepted', 'Job {{job_id}} was accepted by {{agent_id}}.'],
            ['Billing.InvoiceIssued', 'Invoice issued', 'Invoice {{invoice_id}} for {{amount}} {{currency}} was issued.'],
            ['Billing.PaymentCaptured', 'Payment received', 'Payment {{payment_id}} was captured for invoice {{invoice_id}}.'],
            ['Billing.RefundExecuted', 'Refund issued', 'Refund {{refund_id}} was issued.'],
        ];

        foreach ($defaults as [$type, $title, $body]) {
            NotificationTemplate::firstOrCreate(
                ['tenant_id' => null, 'event_type' => $type, 'channel' => 'in_app'],
                ['title_template' => $title, 'body_template' => $body],
            );
        }
    }
}
