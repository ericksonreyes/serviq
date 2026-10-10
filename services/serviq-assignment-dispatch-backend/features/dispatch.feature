Feature: Assignment strategies
  Four strategies: dispatcher, automatic, broadcast, self-assignment.
  Broadcast races resolve to exactly one winner.

  Scenario: Automatic picks the best eligible agent
    Given eligible agents "John" and "Maria"
    When automatic assignment runs
    Then exactly one assignment is created

  Scenario: An expired offer cannot be accepted
    Given an offer that expired
    Then accepting it should be rejected
