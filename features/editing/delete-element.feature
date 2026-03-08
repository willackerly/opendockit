@epic:editing @story:delete-element
Feature: Delete elements

  Selected elements should be deletable, removing them from the Canvas2D
  rendering and hiding the edit panel.

  @e2e @playwright
  Scenario: Delete a selected element
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I click the Delete button
    Then the slide canvas is re-rendered
    And the edit panel is hidden

  @e2e @playwright
  Scenario: Delete button removes the element visually
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I record the canvas image
    And I click the Delete button
    Then the canvas image has changed
