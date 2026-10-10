<?php

namespace spec\App\Domain\Jobs;

use App\Domain\Jobs\JobLifecycle;
use PhpSpec\ObjectBehavior;

class JobLifecycleSpec extends ObjectBehavior
{
    function it_is_initializable()
    {
        $this->shouldHaveType(JobLifecycle::class);
    }

    function it_walks_the_fixed_lifecycle()
    {
        $this->canTransition('requested', 'confirmed')->shouldBe(true);
        $this->canTransition('confirmed', 'ready_for_assignment')->shouldBe(true);
        $this->canTransition('ready_for_assignment', 'assigned')->shouldBe(true);
        $this->canTransition('assigned', 'accepted')->shouldBe(true);
        $this->canTransition('accepted', 'in_progress')->shouldBe(true);
        $this->canTransition('in_progress', 'completed')->shouldBe(true);
    }

    function it_allows_cancellation_from_any_non_terminal_state()
    {
        $this->canTransition('requested', 'cancelled')->shouldBe(true);
        $this->canTransition('in_progress', 'cancelled')->shouldBe(true);
        $this->canTransition('completed', 'cancelled')->shouldBe(false);
    }

    function it_rejects_skips_and_terminal_moves()
    {
        $this->canTransition('requested', 'assigned')->shouldBe(false);
        $this->canTransition('cancelled', 'requested')->shouldBe(false);
        $this->canTransition('completed', 'in_progress')->shouldBe(false);
    }
}
