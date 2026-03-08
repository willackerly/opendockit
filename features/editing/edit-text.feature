@epic:editing @story:edit-text
Feature: Edit text content

  Text-containing shapes should allow editing the text content via the edit
  panel textarea, with changes reflected on the Canvas2D surface.

  @e2e @playwright
  Scenario: Edit text in a shape
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select a text-containing element on slide 1
    And I append " [EDITED]" to the text content
    And I click the Apply button
    Then the slide canvas is re-rendered

  @e2e @playwright
  Scenario: Text edit panel shows current text content
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select a text-containing element on slide 1
    Then the text edit area contains text
