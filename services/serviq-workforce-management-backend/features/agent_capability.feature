Feature: Agent capability
  Workforce answers "can this agent perform this job?" — skills, service
  area, availability. It does not decide who gets the job.

  Scenario: Matching skills and area
    Given an active agent with skills "ac-repair" in area "Antipolo"
    Then the agent is capable of a job needing "ac-repair" in "Antipolo"

  Scenario: Missing skill
    Given an active agent with skills "plumbing" in area "Antipolo"
    Then the agent is not capable of a job needing "ac-repair" in "Antipolo"

  Scenario: Inactive agent is never capable
    Given an inactive agent with skills "ac-repair" in area "Antipolo"
    Then the agent is not capable of a job needing "ac-repair" in "Antipolo"
