<?php

namespace spec\App\Domain\Dispatch;

use App\Domain\Dispatch\AssignmentEngine;
use PhpSpec\ObjectBehavior;

class AssignmentEngineSpec extends ObjectBehavior
{
    function it_is_initializable()
    {
        $this->shouldHaveType(AssignmentEngine::class);
    }

    function it_filters_incapable_agents()
    {
        $agents = [
            (object) ['agent_id' => 'a1', 'status' => 'active', 'skills' => ['plumbing'], 'service_areas' => ['Antipolo']],
            (object) ['agent_id' => 'a2', 'status' => 'inactive', 'skills' => ['ac'], 'service_areas' => ['Antipolo']],
        ];
        $this->rank($agents, ['ac'], 'Antipolo')->shouldHaveCount(0);
    }

    function it_ranks_skill_matches_above_load()
    {
        $a = (object) ['agent_id' => 'a1', 'status' => 'active', 'skills' => ['ac'], 'service_areas' => []];
        $b = (object) ['agent_id' => 'a2', 'status' => 'active', 'skills' => ['ac', 'refrigeration'], 'service_areas' => []];
        $ranked = $this->rank([$a, $b], ['ac', 'refrigeration'], null, ['a2' => 3]);
        $ranked[0]->agent_id->shouldBe('a2');
    }
}
