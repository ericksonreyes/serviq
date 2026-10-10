<?php

namespace Features\Bootstrap;

use Behat\Behat\Context\Context;
use PHPUnit\Framework\Assert;

class CatalogContext implements Context
{
    private array $steps = [];

    /**
     * @Given a service with steps :a, :b, :c
     */
    public function serviceWithSteps(string $a, string $b, string $c): void
    {
        $this->steps = [$a, $b, $c];
    }

    /**
     * @Given a service with no explicit steps
     */
    public function serviceWithNoSteps(): void
    {
        $this->steps = ['Booked', 'Serviced'];
    }

    /**
     * @Then the step at position :pos should be :name
     */
    public function stepAtPosition(int $pos, string $name): void
    {
        Assert::assertSame($name, $this->steps[$pos]);
    }

    /**
     * @Then the template should default to :a then :b
     */
    public function templateDefaults(string $a, string $b): void
    {
        Assert::assertSame([$a, $b], $this->steps);
    }
}
