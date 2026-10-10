<?php

namespace Features\Bootstrap;

use App\Domain\Tenancy\TenantLifecycle;
use Behat\Behat\Context\Context;
use PHPUnit\Framework\Assert;

class TenantContext implements Context
{
    private TenantLifecycle $lifecycle;

    private string $status;

    public function __construct()
    {
        $this->lifecycle = new TenantLifecycle();
    }

    /**
     * @Given a tenant in status :status
     */
    public function aTenantInStatus(string $status): void
    {
        $this->status = $status;
    }

    /**
     * @Then the transition to :to should be allowed
     */
    public function transitionShouldBeAllowed(string $to): void
    {
        Assert::assertTrue($this->lifecycle->canTransition($this->status, $to));
    }

    /**
     * @Then the transition to :to should be rejected
     */
    public function transitionShouldBeRejected(string $to): void
    {
        Assert::assertFalse($this->lifecycle->canTransition($this->status, $to));
    }
}
