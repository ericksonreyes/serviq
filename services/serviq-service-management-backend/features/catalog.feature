Feature: Service catalog workflow template
  A service carries an ordered workflow template that jobs later
  instantiate. Reordering affects new jobs only.

  Scenario: Steps are stored in template order
    Given a service with steps "For Pick Up", "Picked Up", "Delivered"
    Then the step at position 0 should be "For Pick Up"
    And the step at position 2 should be "Delivered"

  Scenario: Default template when none supplied
    Given a service with no explicit steps
    Then the template should default to "Booked" then "Serviced"
