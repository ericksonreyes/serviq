Feature: Notification templates
  Step names arrive as data ({{step_name}}), never as event types. A
  tenant override wins over the system default.

  Scenario: Step name renders into the generic step event template
    Given an event "Job.WorkflowStepCompleted" with step "Picked Up"
    Then the rendered title should mention "Picked Up"

  Scenario: Missing values render empty
    Given an event "Job.Completed" with no customer name
    Then the rendered body should not contain "{{"
