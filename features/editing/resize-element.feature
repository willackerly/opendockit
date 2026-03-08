@epic:editing @story:resize-element
Feature: Resize elements in edit mode

  Selected elements should be resizable via the edit panel width/height
  inputs, with immediate visual feedback.

  @e2e @playwright
  Scenario: Change element width via edit panel
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I change the width to a new value in the edit panel
    And I click the Apply button
    Then the slide canvas is re-rendered

  @e2e @playwright
  Scenario: Resize preserves element position
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I record the current position
    And I change the width to a new value in the edit panel
    And I click the Apply button
    Then the element position has not changed
