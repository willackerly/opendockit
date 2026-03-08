@epic:editing @story:select-element
Feature: Select elements in edit mode

  Users should be able to click on any element (shape, picture, table, group)
  in edit mode to select it and see its properties in the edit panel.

  @e2e @playwright
  Scenario: Enter edit mode and select a shape
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    Then the edit panel is visible
    And the edit panel shows the element kind
    And the edit panel shows the element ID containing "#"

  @e2e @playwright
  Scenario: Selection shows a highlight overlay
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    Then a selection highlight is visible on the slide

  @e2e @playwright
  Scenario: Escape dismisses the selection
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I press Escape
    Then the edit panel is hidden
    And no selection highlight is visible
