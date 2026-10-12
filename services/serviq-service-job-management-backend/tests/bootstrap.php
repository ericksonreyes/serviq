<?php

// Test-run safety rail. The running service containers export their real
// .env (DB_CONNECTION=pgsql, DB_HOST=postgres, ...) into the process
// environment, and phpunit.xml <env> values do NOT reliably override
// exported variables. Without this guard, RefreshDatabase would call
// migrate:fresh on the LIVE development database — wiping it.
//
// If this aborts, the suite was invoked inside a running container
// (docker exec … phpunit). Run tests via ./scripts/test.sh, or pass
// explicit overrides: docker exec -e DB_CONNECTION=sqlite -e DB_DATABASE=:memory: …

require __DIR__.'/../vendor/autoload.php';

$connection = $_SERVER['DB_CONNECTION'] ?? $_ENV['DB_CONNECTION'] ?? getenv('DB_CONNECTION') ?: null;

if ($connection !== 'sqlite') {
    fwrite(STDERR, sprintf(
        "\nRefusing to run tests: DB_CONNECTION=%s resolved — suites must run\n"
        ."against in-memory sqlite. Use ./scripts/test.sh, or pass\n"
        ."-e DB_CONNECTION=sqlite -e DB_DATABASE=:memory: to docker exec.\n\n",
        var_export($connection, true)
    ));
    exit(1);
}
