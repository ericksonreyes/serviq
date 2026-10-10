<?php

namespace spec\App\Domain\Tenancy;

use App\Domain\Tenancy\TenantLifecycle;
use PhpSpec\ObjectBehavior;

class TenantLifecycleSpec extends ObjectBehavior
{
    function it_is_initializable()
    {
        $this->shouldHaveType(TenantLifecycle::class);
    }

    function it_allows_pending_to_activate_or_deactivate()
    {
        $this->canTransition('pending', 'active')->shouldBe(true);
        $this->canTransition('pending', 'deactivated')->shouldBe(true);
        $this->canTransition('pending', 'suspended')->shouldBe(false);
    }

    function it_allows_active_to_suspend_or_deactivate()
    {
        $this->canTransition('active', 'suspended')->shouldBe(true);
        $this->canTransition('active', 'deactivated')->shouldBe(true);
        $this->canTransition('active', 'pending')->shouldBe(false);
    }

    function it_allows_suspended_back_to_active_or_deactivated()
    {
        $this->canTransition('suspended', 'active')->shouldBe(true);
        $this->canTransition('suspended', 'deactivated')->shouldBe(true);
        $this->canTransition('suspended', 'pending')->shouldBe(false);
    }

    function it_treats_deactivated_as_terminal()
    {
        $this->canTransition('deactivated', 'active')->shouldBe(false);
        $this->canTransition('deactivated', 'suspended')->shouldBe(false);
        $this->isTerminal('deactivated')->shouldBe(true);
        $this->isTerminal('active')->shouldBe(false);
    }

    function it_reports_valid_source_statuses_for_a_target()
    {
        $this->sourcesFor('active')->shouldBe(['pending', 'suspended']);
        $this->sourcesFor('deactivated')->shouldBe(['pending', 'active', 'suspended']);
    }
}
