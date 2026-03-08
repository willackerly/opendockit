@epic:rendering @story:basic-text
Feature: Basic text rendering

  Text within shapes should render using the correct font, size, and color
  on the Canvas2D surface. The font system resolves theme fonts and loads
  bundled WOFF2 substitutes.

  @e2e @playwright
  Scenario: Text appears on the rendered slide
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    Then the slide canvas is not blank

  @e2e @playwright
  Scenario: Theme fonts are resolved and loaded
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    Then the font "Calibri" is registered in the browser
    And the font "Calibri Light" is registered in the browser
    And the font "Arial" is registered in the browser

  @e2e @playwright
  Scenario: Font stress test loads all bundled font families
    Given a PPTX file "font-stress-test.pptx" is loaded in the viewer
    Then at least 40 fonts are registered in the browser
