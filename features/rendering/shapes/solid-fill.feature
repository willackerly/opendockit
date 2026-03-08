@epic:rendering @story:solid-fill
Feature: Solid fill rendering

  Shapes with solid color fills should render with the correct color
  on the Canvas2D surface, including theme-resolved colors.

  @e2e @playwright
  Scenario: Shape with solid fill renders on canvas
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    When I scroll to slide 1
    Then the slide canvas is not blank

  @e2e @playwright
  Scenario: Inspector identifies shape elements
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And inspector mode is enabled
    When I click at position 50%, 35% on slide 1
    Then the inspector tooltip shows a shape element
