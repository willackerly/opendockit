@epic:editing @story:move-element
Feature: Move elements in edit mode

  Selected elements should be movable via nudge buttons or arrow keys,
  with immediate visual feedback on the Canvas2D surface.

  @e2e @playwright
  Scenario: Nudge element right via button
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I nudge the element right
    Then the element X position increases
    And the slide canvas is re-rendered

  @e2e @playwright
  Scenario: Nudge element with arrow key
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I press ArrowDown
    Then the element Y position increases
    And the slide canvas is re-rendered

  @e2e @playwright
  Scenario: Apply position change from edit panel
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I increase the X position by 1 inch in the edit panel
    And I click the Apply button
    Then the slide canvas is re-rendered
    And the Save button is enabled
