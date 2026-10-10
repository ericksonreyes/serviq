<?php

namespace Features\Bootstrap;

use App\Models\Agent;
use Behat\Behat\Context\Context;
use PHPUnit\Framework\Assert;

class WorkforceContext implements Context
{
    private Agent $agent;

    /**
     * @Given an active agent with skills :skills in area :area
     */
    public function activeAgentWithSkills(string $skills, string $area): void
    {
        $this->agent = new Agent(['status' => 'active', 'skills' => [$skills], 'service_areas' => [$area]]);
    }

    /**
     * @Given an inactive agent with skills :skills in area :area
     */
    public function inactiveAgentWithSkills(string $skills, string $area): void
    {
        $this->agent = new Agent(['status' => 'inactive', 'skills' => [$skills], 'service_areas' => [$area]]);
    }

    /**
     * @Then the agent is capable of a job needing :skill in :area
     */
    public function agentIsCapable(string $skill, string $area): void
    {
        Assert::assertTrue($this->agent->isCapableOf([$skill], $area));
    }

    /**
     * @Then the agent is not capable of a job needing :skill in :area
     */
    public function agentIsNotCapable(string $skill, string $area): void
    {
        Assert::assertFalse($this->agent->isCapableOf([$skill], $area));
    }
}
