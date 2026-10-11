<?php

namespace Features\Bootstrap;

use Behat\Behat\Context\Context;
use PHPUnit\Framework\Assert;

class RequestContext implements Context
{
    private const CONVERTIBLE = ['submitted', 'reviewed'];

    private string $status;

    /**
     * @Given a request in status :status
     */
    public function requestInStatus(string $status): void
    {
        $this->status = $status;
    }

    /**
     * @Then converting it should be allowed
     */
    public function convertingAllowed(): void
    {
        Assert::assertContains($this->status, self::CONVERTIBLE);
    }

    /**
     * @Then cancelling it should be rejected
     */
    public function cancellingRejected(): void
    {
        Assert::assertSame('converted', $this->status);
    }
}
