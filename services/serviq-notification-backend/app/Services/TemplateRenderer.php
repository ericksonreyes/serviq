<?php

namespace App\Services;

/**
 * Renders {{placeholder}} templates against an event payload — step names
 * arrive as data ({{step_name}}), never as event types.
 */
class TemplateRenderer
{
    public function render(string $template, array $context): string
    {
        return (string) preg_replace_callback('/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/', function ($m) use ($context) {
            $value = data_get($context, $m[1]);

            return is_scalar($value) ? (string) $value : ($value === null ? '' : json_encode($value));
        }, $template);
    }
}
