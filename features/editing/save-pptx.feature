@epic:editing @story:save-pptx
Feature: Save edited PPTX

  After making edits, the user should be able to save the modified PPTX
  file. The save pipeline performs surgical XML patching and produces a
  valid PPTX ZIP archive.

  @e2e @playwright
  Scenario: Save button is disabled before any edits
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    Then the Save button is disabled

  @e2e @playwright
  Scenario: Save button enables after an edit
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I nudge the element right
    Then the Save button is enabled

  @e2e @playwright
  Scenario: Save produces a valid PPTX file
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    And edit mode is enabled
    When I select an element on slide 1
    And I nudge the element right
    And I click the Save button
    Then a PPTX file is downloaded
    And the downloaded file is larger than 1000 bytes
