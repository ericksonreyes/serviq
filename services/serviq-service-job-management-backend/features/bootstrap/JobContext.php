<?php

namespace Features\Bootstrap;

use App\Domain\Jobs\JobLifecycle;
use Behat\Behat\Context\Context;
use PHPUnit\Framework\Assert;

class JobContext implements Context
{
    private JobLifecycle $lifecycle;

    private string $status;

    public function __construct()
    {
        $this->lifecycle = new JobLifecycle();
    }

    /**
     * @Given a job in status :status
     */
    public function jobInStatus(string $status): void
    {
        $this->status = $status;
    }

    /**
     * @Then the transitions :sequence should all be allowed in sequence
     */
    public function transitionsAllowedInSequence(string $sequence): void
    {
        $status = $this->status;
        foreach (explode('", "', trim($sequence, '"')) as $target) {
            $target = trim($target, '"');
            Assert::assertTrue(
                $this->lifecycle->canTransition($status, $target),
                "{$status} → {$target} should be allowed",
            );
            $status = $target;
        }
    }

    /**
     * @Then the transition to :to should be rejected
     */
    public function transitionRejected(string $to): void
    {
        Assert::assertFalse($this->lifecycle->canTransition($this->status, $to));
    }
}
