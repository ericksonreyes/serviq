Feature: JWT claim contract
  Identity & Access is the sole JWT issuer (ADR-0001). Every issued token
  carries the canonical claims downstream services validate locally.

  Scenario: A tenant user receives a tenant-scoped token
    Given a user "u-100" in tenant scope "t-200" with roles "Dispatcher" and permissions "job.read"
    When IAM issues a token for them
    Then the claims should carry sub "u-100" and tenant_id "t-200"
    And the claims should carry roles "Dispatcher"
    And the claims should carry permissions "job.read"
    And the token should expire 3600 seconds after issue
    And the claims should carry issuer "serviq-iam", audience "serviq" and a unique jti

  Scenario: A platform user carries no tenant scope
    Given a user "u-300" in platform scope with roles "Platform Administrator" and permissions "iam.users.manage"
    When IAM issues a token for them
    Then the claims should carry sub "u-300" and tenant_id ""
    And the claims should carry roles "Platform Administrator"
