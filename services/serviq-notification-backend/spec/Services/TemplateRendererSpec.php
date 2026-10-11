<?php

namespace spec\App\Services;

use App\Services\TemplateRenderer;
use PhpSpec\ObjectBehavior;

class TemplateRendererSpec extends ObjectBehavior
{
    function it_is_initializable()
    {
        $this->shouldHaveType(TemplateRenderer::class);
    }

    function it_substitutes_placeholders_from_context()
    {
        $this->render('Job {{job_id}} at {{step_name}}', ['job_id' => 'J-1', 'step_name' => 'Picked Up'])
            ->shouldBe('Job J-1 at Picked Up');
    }

    function it_renders_missing_placeholders_as_empty()
    {
        $this->render('Hello {{name}}!', [])->shouldBe('Hello !');
    }

    function it_supports_nested_dot_paths()
    {
        $this->render('Hi {{customer.name}}', ['customer' => ['name' => 'Maria']])->shouldBe('Hi Maria');
    }
}
