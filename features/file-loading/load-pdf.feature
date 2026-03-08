@epic:file-loading @story:load-pdf
Feature: Load PDF files

  PDF loading support is planned for the unified render backend.
  These scenarios document the expected behavior once implemented.

  @e2e @playwright @future
  Scenario: Load a PDF file and see rendered pages
    Given a PDF file "sample.pdf" is loaded in the viewer
    Then the status bar shows "Rendered"
    And at least 1 page is visible

  @e2e @playwright @future
  Scenario: PDF text is selectable
    Given a PDF file "sample.pdf" is loaded in the viewer
    When I click on a text region
    Then the text content is accessible
