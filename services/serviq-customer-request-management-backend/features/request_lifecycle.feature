Feature: Service request lifecycle
  A request is customer intent: submitted → reviewed → converted, or
  cancelled before conversion.

  Scenario: A submitted request can be converted
    Given a request in status "submitted"
    Then converting it should be allowed

  Scenario: A converted request cannot be cancelled
    Given a request in status "converted"
    Then cancelling it should be rejected
