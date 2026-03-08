@epic:rendering @story:preset-geometry
Feature: Preset geometry rendering

  OOXML defines 187 preset geometry shapes (rectangles, arrows, stars, etc.)
  that should render correctly using the geometry engine and Canvas2D path builder.

  @e2e @playwright
  Scenario: Shapes render on the slide canvas
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    When I scroll to slide 1
    Then the slide canvas is not blank

  @e2e @playwright
  Scenario: Multiple shape types are detectable on a slide
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And inspector mode is enabled
    When I scan slide 1 with a 8x6 grid
    Then at least 2 elements are found
