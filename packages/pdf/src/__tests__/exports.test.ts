import { describe, it, expect } from 'vitest';

/**
 * Verifies that @opendockit/pdf re-exports all expected symbols from
 * @opendockit/pdf-signer. These are smoke tests — they confirm the
 * re-export wiring is correct without exercising business logic.
 */

describe('@opendockit/pdf main exports', () => {
  it('exports document classes', async () => {
    const pdf = await import('../index.js');
    expect(pdf.PDFDocument).toBeDefined();
    expect(pdf.PDFPage).toBeDefined();
    expect(pdf.PDFFont).toBeDefined();
    expect(pdf.PDFImage).toBeDefined();
    expect(pdf.PDFEmbeddedPage).toBeDefined();
    expect(pdf.PDFForm).toBeDefined();
  });

  it('exports form field classes', async () => {
    const pdf = await import('../index.js');
    expect(pdf.PDFField).toBeDefined();
    expect(pdf.PDFTextField).toBeDefined();
    expect(pdf.PDFCheckBox).toBeDefined();
    expect(pdf.PDFRadioGroup).toBeDefined();
    expect(pdf.PDFDropdown).toBeDefined();
    expect(pdf.PDFOptionList).toBeDefined();
    expect(pdf.PDFButton).toBeDefined();
    expect(pdf.PDFSignature).toBeDefined();
  });

  it('exports color factories', async () => {
    const pdf = await import('../index.js');
    expect(pdf.rgb).toBeTypeOf('function');
    expect(pdf.cmyk).toBeTypeOf('function');
    expect(pdf.grayscale).toBeTypeOf('function');
    expect(pdf.colorToComponents).toBeTypeOf('function');
    expect(pdf.componentsToColor).toBeTypeOf('function');
    expect(pdf.ColorTypes).toBeDefined();
  });

  it('exports rotation factories', async () => {
    const pdf = await import('../index.js');
    expect(pdf.degrees).toBeTypeOf('function');
    expect(pdf.radians).toBeTypeOf('function');
    expect(pdf.degreesToRadians).toBeTypeOf('function');
    expect(pdf.radiansToDegrees).toBeTypeOf('function');
    expect(pdf.toRadians).toBeTypeOf('function');
    expect(pdf.toDegrees).toBeTypeOf('function');
    expect(pdf.reduceRotation).toBeTypeOf('function');
    expect(pdf.adjustDimsForRotation).toBeTypeOf('function');
    expect(pdf.RotationTypes).toBeDefined();
  });

  it('exports enums and constants', async () => {
    const pdf = await import('../index.js');
    expect(pdf.StandardFonts).toBeDefined();
    expect(pdf.ParseSpeeds).toBeDefined();
    expect(pdf.BlendMode).toBeDefined();
    expect(pdf.LineCapStyle).toBeDefined();
    expect(pdf.TextRenderingMode).toBeDefined();
    expect(pdf.TextAlignment).toBeDefined();
    expect(pdf.ImageAlignment).toBeDefined();
    expect(pdf.AFRelationship).toBeDefined();
    expect(pdf.PageSizes).toBeDefined();
  });

  it('exports annotation classes and flags', async () => {
    const pdf = await import('../index.js');
    expect(pdf.PDAnnotation).toBeDefined();
    expect(pdf.PDAnnotationHighlight).toBeDefined();
    expect(pdf.PDAnnotationUnderline).toBeDefined();
    expect(pdf.PDAnnotationStrikeout).toBeDefined();
    expect(pdf.PDAnnotationSquiggly).toBeDefined();
    expect(pdf.PDAnnotationText).toBeDefined();
    expect(pdf.PDAnnotationFreeText).toBeDefined();
    expect(pdf.PDAnnotationRubberStamp).toBeDefined();
    expect(pdf.PDAnnotationLine).toBeDefined();
    expect(pdf.PDAnnotationSquare).toBeDefined();
    expect(pdf.PDAnnotationCircle).toBeDefined();
    expect(pdf.PDAnnotationInk).toBeDefined();
    expect(pdf.PDAnnotationLink).toBeDefined();
    expect(pdf.PDAnnotationRedact).toBeDefined();
    expect(pdf.ANNOTATION_FLAG_PRINT).toBeDefined();
    expect(pdf.StampName).toBeDefined();
    expect(pdf.TextIconName).toBeDefined();
    expect(pdf.LineEndingStyle).toBeDefined();
    expect(pdf.FreeTextAlignment).toBeDefined();
  });

  it('exports content stream builder', async () => {
    const pdf = await import('../index.js');
    expect(pdf.ContentStreamBuilder).toBeDefined();
    expect(pdf.formatNumber).toBeTypeOf('function');
  });

  it('exports font metrics', async () => {
    const pdf = await import('../index.js');
    expect(pdf.StandardFontMetrics).toBeDefined();
    expect(pdf.WinAnsiEncoding).toBeDefined();
    expect(pdf.SymbolEncoding).toBeDefined();
    expect(pdf.ZapfDingbatsEncoding).toBeDefined();
    expect(pdf.encodingForFont).toBeTypeOf('function');
    expect(pdf.encodeTextToHex).toBeTypeOf('function');
    expect(pdf.layoutMultilineText).toBeTypeOf('function');
  });

  it('exports field appearance generators', async () => {
    const pdf = await import('../index.js');
    expect(pdf.generateTextFieldAppearance).toBeTypeOf('function');
    expect(pdf.generateCheckBoxAppearance).toBeTypeOf('function');
    expect(pdf.generateDropdownAppearance).toBeTypeOf('function');
    expect(pdf.generateAllFieldAppearances).toBeTypeOf('function');
  });

  it('exports redaction functions', async () => {
    const pdf = await import('../index.js');
    expect(pdf.applyRedactions).toBeTypeOf('function');
    expect(pdf.tokenizeContentStream).toBeTypeOf('function');
    expect(pdf.parseOperations).toBeTypeOf('function');
  });

  it('exports page copy function', async () => {
    const pdf = await import('../index.js');
    expect(pdf.copyPages).toBeTypeOf('function');
  });

  it('exports CFF parser and font subsetter', async () => {
    const pdf = await import('../index.js');
    expect(pdf.parseCFFFont).toBeTypeOf('function');
    expect(pdf.subsetTrueTypeFont).toBeTypeOf('function');
  });

  it('exports PDF/A compliance', async () => {
    const pdf = await import('../index.js');
    expect(pdf.applyPDFAConformance).toBeTypeOf('function');
    expect(pdf.generateXMPMetadata).toBeTypeOf('function');
    expect(pdf.buildSRGBICCProfile).toBeTypeOf('function');
  });

  it('exports content extraction', async () => {
    const pdf = await import('../index.js');
    expect(pdf.extractText).toBeTypeOf('function');
    expect(pdf.extractTextContent).toBeTypeOf('function');
    expect(pdf.extractImages).toBeTypeOf('function');
    expect(pdf.extractPageText).toBeTypeOf('function');
    expect(pdf.extractPageImages).toBeTypeOf('function');
    expect(pdf.joinTextItems).toBeTypeOf('function');
    expect(pdf.getDecompressedStreamData).toBeTypeOf('function');
    expect(pdf.getRawStreamData).toBeTypeOf('function');
    expect(pdf.getStreamFilters).toBeTypeOf('function');
    expect(pdf.parseToUnicodeCMap).toBeTypeOf('function');
    expect(pdf.buildFontDecoder).toBeTypeOf('function');
    expect(pdf.glyphNameToUnicode).toBeTypeOf('function');
    expect(pdf.loadAndParseDocument).toBeTypeOf('function');
  });

  it('exports encryption/decryption API', async () => {
    const pdf = await import('../index.js');
    expect(pdf.PDFEncryptor).toBeDefined();
    expect(pdf.PDFDecryptor).toBeDefined();
    expect(pdf.computePermissions).toBeTypeOf('function');
    expect(pdf.parsePermissions).toBeTypeOf('function');
    expect(pdf.parseEncryptionDict).toBeTypeOf('function');
    expect(pdf.getEncryptionDescription).toBeTypeOf('function');
    expect(pdf.validateEncryption).toBeTypeOf('function');
  });

  it('does NOT export signing-specific APIs', async () => {
    const pdf = await import('../index.js');
    // These should only be available from @opendockit/pdf-signer
    expect((pdf as Record<string, unknown>).signPDFWithPDFBox).toBeUndefined();
    expect((pdf as Record<string, unknown>).preparePdfWithAppearance).toBeUndefined();
    expect((pdf as Record<string, unknown>).signPreparedPdfWithPDFBox).toBeUndefined();
    expect((pdf as Record<string, unknown>).fetchTimestampToken).toBeUndefined();
    expect((pdf as Record<string, unknown>).addLtvToPdf).toBeUndefined();
    expect((pdf as Record<string, unknown>).verifySignatures).toBeUndefined();
    expect((pdf as Record<string, unknown>).PDFBOX_TS_VERSION).toBeUndefined();
  });
});

describe('@opendockit/pdf sub-path exports', () => {
  it('extraction sub-path exports', async () => {
    const ext = await import('../extraction.js');
    expect(ext.extractText).toBeTypeOf('function');
    expect(ext.extractTextContent).toBeTypeOf('function');
    expect(ext.extractImages).toBeTypeOf('function');
    expect(ext.extractPageText).toBeTypeOf('function');
    expect(ext.joinTextItems).toBeTypeOf('function');
    expect(ext.loadAndParseDocument).toBeTypeOf('function');
  });

  it('annotations sub-path exports', async () => {
    const ann = await import('../annotations.js');
    expect(ann.PDAnnotation).toBeDefined();
    expect(ann.PDAnnotationHighlight).toBeDefined();
    expect(ann.PDAnnotationRedact).toBeDefined();
    expect(ann.ANNOTATION_FLAG_PRINT).toBeDefined();
    expect(ann.StampName).toBeDefined();
  });

  it('redaction sub-path exports', async () => {
    const red = await import('../redaction.js');
    expect(red.applyRedactions).toBeTypeOf('function');
    expect(red.tokenizeContentStream).toBeTypeOf('function');
    expect(red.parseOperations).toBeTypeOf('function');
  });

  it('pdfa sub-path exports', async () => {
    const pdfa = await import('../pdfa.js');
    expect(pdfa.applyPDFAConformance).toBeTypeOf('function');
    expect(pdfa.generateXMPMetadata).toBeTypeOf('function');
    expect(pdfa.buildSRGBICCProfile).toBeTypeOf('function');
  });

  it('content-stream sub-path exports', async () => {
    const cs = await import('../content-stream.js');
    expect(cs.ContentStreamBuilder).toBeDefined();
    expect(cs.formatNumber).toBeTypeOf('function');
  });

  it('fonts sub-path exports', async () => {
    const fonts = await import('../fonts.js');
    expect(fonts.StandardFontMetrics).toBeDefined();
    expect(fonts.WinAnsiEncoding).toBeDefined();
    expect(fonts.encodingForFont).toBeTypeOf('function');
    expect(fonts.layoutMultilineText).toBeTypeOf('function');
    expect(fonts.TextAlignment).toBeDefined();
  });

  it('render sub-path exports', async () => {
    const render = await import('../render.js');
    expect(render.PDFRenderer).toBeDefined();
    expect(render.NativeRenderer).toBeDefined();
    expect(render.evaluatePage).toBeTypeOf('function');
    expect(render.OperatorList).toBeDefined();
    expect(render.OPS).toBeDefined();
  });

  it('elements sub-path exports', async () => {
    const elements = await import('../elements.js');
    expect(elements.queryElementsInRect).toBeTypeOf('function');
    expect(elements.queryTextInRect).toBeTypeOf('function');
    expect(elements.elementAtPoint).toBeTypeOf('function');
    expect(elements.boundingBox).toBeTypeOf('function');
    expect(elements.InteractionStore).toBeDefined();
    expect(elements.viewportToPage).toBeTypeOf('function');
  });
});
