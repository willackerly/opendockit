@epic:rendering @story:text-alignment
Feature: Text alignment rendering

  OOXML supports multiple paragraph alignment modes including left, center,
  right, justify, and distributed. These should render correctly using
  Canvas2D text measurement and positioning.

  @e2e @playwright
  Scenario: Slide with text renders without errors
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    Then the status bar shows "Rendered"
    And no console errors are present

  @e2e @playwright
  Scenario: Text-containing shapes are selectable in edit mode
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    Then the edit panel is visible
