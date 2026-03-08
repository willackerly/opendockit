@epic:rendering @story:gradient-fill
Feature: Gradient fill rendering

  Shapes with gradient fills (linear, radial, path) should render
  correctly using Canvas2D gradient APIs.

  @e2e @playwright
  Scenario: Slide with gradient shapes renders without errors
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    Then the status bar shows "Rendered"
    And no console errors are present

  @e2e @playwright
  Scenario: Gradient shape is detectable via inspector
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And inspector mode is enabled
    When I scan slide 1 with a 5x5 grid
    Then at least 1 element is found
