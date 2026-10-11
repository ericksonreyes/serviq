<?php

namespace Features\Bootstrap;

use App\Services\TemplateRenderer;
use Behat\Behat\Context\Context;
use PHPUnit\Framework\Assert;

class NotificationContext implements Context
{
    private TemplateRenderer $renderer;

    private string $title = '';

    private string $body = '';

    public function __construct()
    {
        $this->renderer = new TemplateRenderer();
    }

    /**
     * @Given an event :type with step :step
     */
    public function eventWithStep(string $type, string $step): void
    {
        $this->title = $this->renderer->render('Step done: {{step_name}}', ['step_name' => $step]);
    }

    /**
     * @Given an event :type with no customer name
     */
    public function eventWithoutName(string $type): void
    {
        $this->body = $this->renderer->render('Thanks {{customer_name}}!', []);
    }

    /**
     * @Then the rendered title should mention :text
     */
    public function titleMentions(string $text): void
    {
        Assert::assertStringContainsString($text, $this->title);
    }

    /**
     * @Then the rendered body should not contain :needle
     */
    public function bodyLacks(string $needle): void
    {
        Assert::assertStringNotContainsString($needle, $this->body);
    }
}
