@epic:file-loading @story:load-pptx
Feature: Load PPTX files

  Users should be able to load PPTX files into the viewer and see
  all slides rendered correctly with fonts loaded.

  @e2e @playwright
  Scenario: Load a simple PPTX file and see rendered slides
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    Then the status bar shows "Rendered"
    And at least 1 slide is visible

  @e2e @playwright
  Scenario: Fonts are registered after loading a PPTX
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    Then the font "Calibri" is registered in the browser
    And the font "Calibri Light" is registered in the browser

  @e2e @playwright
  Scenario: Load a multi-slide PPTX file
    Given a PPTX file "font-stress-test.pptx" is loaded in the viewer
    Then the status bar shows "Rendered"
    And at least 2 slides are visible

  @e2e @playwright
  Scenario: Bundled fonts render differently from fallback
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    Then the font "Calibri" renders differently from sans-serif fallback
