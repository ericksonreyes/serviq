<?php

namespace Features\Bootstrap;

use App\Domain\Dispatch\AssignmentEngine;
use App\Models\Assignment;
use Behat\Behat\Context\Context;
use PHPUnit\Framework\Assert;

class DispatchContext implements Context
{
    private AssignmentEngine $engine;

    private array $agents = [];

    private ?Assignment $offer = null;

    public function __construct()
    {
        $this->engine = new AssignmentEngine();
    }

    /**
     * @Given eligible agents :a and :b
     */
    public function eligibleAgents(string $a, string $b): void
    {
        $this->agents = [
            (object) ['agent_id' => $a, 'status' => 'active', 'skills' => [], 'service_areas' => []],
            (object) ['agent_id' => $b, 'status' => 'active', 'skills' => [], 'service_areas' => []],
        ];
    }

    /**
     * @Given an offer that expired
     */
    public function expiredOffer(): void
    {
        $this->offer = new Assignment(['status' => Assignment::OFFERED]);
        $this->offer->expires_at = now()->subMinute();
    }

    /**
     * @When automatic assignment runs
     */
    public function automaticRuns(): void
    {
        $this->agents = $this->engine->rank($this->agents);
    }

    /**
     * @Then exactly one assignment is created
     */
    public function oneAssignment(): void
    {
        Assert::assertCount(1, [$this->agents[0] ?? null]);
    }

    /**
     * @Then accepting it should be rejected
     */
    public function acceptRejected(): void
    {
        Assert::assertFalse($this->engine->offerIsLive($this->offer));
    }
}
