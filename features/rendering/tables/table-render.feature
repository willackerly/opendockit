@epic:rendering @story:table-render
Feature: Table rendering

  OOXML tables within graphic frames should render with correct cell layout,
  borders, and text content. Row heights are minimums that auto-expand.

  @e2e @playwright
  Scenario: Slide with tables renders without errors
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    Then the status bar shows "Rendered"
    And no console errors are present

  @e2e @playwright
  Scenario: Table elements are detectable
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And inspector mode is enabled
    When I scan slide 1 with a 8x6 grid
    Then at least 1 element is found
