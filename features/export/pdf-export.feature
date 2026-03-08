@epic:export @story:pdf-export
Feature: PDF export

  PDF export is planned via the RenderBackend abstraction using pdfbox-ts
  NativePDFWriter and ContentStreamBuilder. These scenarios document the
  expected behavior once the PDFBackend is implemented.

  @e2e @playwright @future
  Scenario: Export a PPTX slide to PDF
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    When I click the Export PDF button
    Then a PDF file is downloaded

  @e2e @playwright @future
  Scenario: Exported PDF contains all slides
    Given a PPTX file "basic-shapes.pptx" is loaded in the viewer
    When I click the Export PDF button
    Then the PDF page count matches the slide count
