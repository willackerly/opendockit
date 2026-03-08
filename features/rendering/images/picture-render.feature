@epic:rendering @story:picture-render
Feature: Picture rendering

  Images embedded in PPTX files (JPEG, PNG) should render correctly on the
  Canvas2D surface at the correct position and size, with proper cropping
  and aspect ratio handling.

  @e2e @playwright
  Scenario: Slide with images renders without errors
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    Then the status bar shows "Rendered"
    And no console errors are present

  @e2e @playwright
  Scenario: Picture elements are identifiable via inspector
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And inspector mode is enabled
    When I scan slide 1 with a 8x6 grid
    Then at least 1 element is found
