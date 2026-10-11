Feature: Job lifecycle
  Jobs move through a fixed lifecycle (Requested → Completed/Cancelled)
  while workflow steps are data carried in the workflow instance.

  Scenario: Full happy path
    Given a job in status "requested"
    Then the transitions "confirmed", "ready_for_assignment", "assigned", "accepted", "in_progress", "completed" should all be allowed in sequence

  Scenario: No skipping the queue
    Given a job in status "requested"
    Then the transition to "assigned" should be rejected

  Scenario: Completed is terminal
    Given a job in status "completed"
    Then the transition to "in_progress" should be rejected
