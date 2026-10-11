Feature: Tenant lifecycle
  Platform Management owns the Tenant entity (ADR-0002). Lifecycle
  transitions follow a strict state machine — illegal moves are rejected.

  Scenario: A new tenant can be activated
    Given a tenant in status "pending"
    Then the transition to "active" should be allowed

  Scenario: An active tenant can be suspended and deactivated
    Given a tenant in status "active"
    Then the transition to "suspended" should be allowed
    And the transition to "deactivated" should be allowed

  Scenario: A suspended tenant can be reactivated
    Given a tenant in status "suspended"
    Then the transition to "active" should be allowed

  Scenario: Deactivation is final
    Given a tenant in status "deactivated"
    Then the transition to "active" should be rejected

  Scenario: A pending tenant cannot skip straight to suspended
    Given a tenant in status "pending"
    Then the transition to "suspended" should be rejected
