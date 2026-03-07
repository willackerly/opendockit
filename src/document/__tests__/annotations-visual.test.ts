import { describe, it, beforeAll } from 'vitest';

import { PDFDocument } from '../../document/PDFDocument';
import { StandardFonts } from '../../document/StandardFonts';
import { rgb } from '../../document/colors';
import {
  PDAnnotationHighlight,
  PDAnnotationUnderline,
  PDAnnotationStrikeout,
  PDAnnotationSquiggly,
  PDAnnotationText,
  PDAnnotationFreeText,
  PDAnnotationRubberStamp,
  PDAnnotationLine,
  PDAnnotationSquare,
  PDAnnotationCircle,
  PDAnnotationInk,
  PDAnnotationLink,
  ANNOTATION_FLAG_PRINT,
  StampName,
  TextIconName,
  LineEndingStyle,
} from '../../document/annotations';
import {
  isPdftoppmAvailable,
  renderPdfPage,
  compareSnapshots,
  snapshotPath,
  readSnapshot,
  updateSnapshot,
  writeDiff,
  isUpdateMode,
} from '../../testing/visual-test-helpers';

function assertSnapshot(testName: string, pngBuf: Buffer): void {
  if (isUpdateMode()) {
    updateSnapshot(testName, pngBuf);
    console.log(`  [snapshot updated] ${snapshotPath(testName)}`);
    return;
  }

  const reference = readSnapshot(testName);
  if (!reference) {
    throw new Error(
      `No reference snapshot found for "${testName}". ` +
      `Run with PDFBOX_TS_UPDATE_SNAPSHOTS=1 to generate.`,
    );
  }

  const result = compareSnapshots(pngBuf, reference);
  if (!result.match) {
    writeDiff(testName, result.diffPng);
    throw new Error(
      `Visual mismatch for "${testName}": ${result.mismatchPercent.toFixed(2)}% pixels differ ` +
      `(${result.mismatchPixels}/${result.totalPixels}). ` +
      `Diff saved to ${snapshotPath(testName).replace('.png', '-diff.png')}`,
    );
  }
}

const skipVisual = !process.env.PDFBOX_TS_E2E_VISUAL;

describe.skipIf(skipVisual)('annotations visual rendering', () => {
  beforeAll(() => {
    if (!isPdftoppmAvailable()) {
      throw new Error('pdftoppm not available — cannot run visual rendering tests');
    }
  });

  it('annotations kitchen sink — all 12 types on one page', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    // Draw backdrop text
    page.drawText('Annotations Kitchen Sink Test', {
      x: 50, y: 750, size: 18, font, color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('This page contains all 12 annotation types for visual testing.', {
      x: 50, y: 720, size: 10, font, color: rgb(0.4, 0.4, 0.4),
    });

    // Draw some text lines as targets for text markup annotations
    for (let i = 0; i < 6; i++) {
      page.drawText(`Sample text line ${i + 1} for annotation testing purposes`, {
        x: 50, y: 680 - i * 20, size: 11, font, color: rgb(0.2, 0.2, 0.2),
      });
    }

    // 1. Highlight
    page.addAnnotation(new PDAnnotationHighlight({
      rect: [50, 672, 400, 688],
      color: rgb(1, 1, 0),
      quadPoints: [50, 688, 400, 688, 50, 672, 400, 672],
      contents: 'Highlight',
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 2. Underline
    page.addAnnotation(new PDAnnotationUnderline({
      rect: [50, 652, 400, 668],
      color: rgb(0, 0.5, 0),
      quadPoints: [50, 668, 400, 668, 50, 652, 400, 652],
      contents: 'Underline',
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 3. Strikeout
    page.addAnnotation(new PDAnnotationStrikeout({
      rect: [50, 632, 400, 648],
      color: rgb(1, 0, 0),
      quadPoints: [50, 648, 400, 648, 50, 632, 400, 632],
      contents: 'Strikeout',
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 4. Squiggly
    page.addAnnotation(new PDAnnotationSquiggly({
      rect: [50, 612, 400, 628],
      color: rgb(0, 0, 1),
      quadPoints: [50, 628, 400, 628, 50, 612, 400, 612],
      contents: 'Squiggly',
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 5. Text (sticky note)
    page.addAnnotation(new PDAnnotationText({
      rect: [500, 700, 520, 720],
      iconName: TextIconName.NOTE,
      contents: 'This is a sticky note',
      color: rgb(1, 0.9, 0.4),
      open: false,
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 6. FreeText
    page.addAnnotation(new PDAnnotationFreeText({
      rect: [50, 520, 300, 560],
      contents: 'Free text annotation',
      fontSize: 14,
      color: rgb(0, 0, 0.8),
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 7. Rubber Stamp
    page.addAnnotation(new PDAnnotationRubberStamp({
      rect: [350, 520, 550, 570],
      stampName: StampName.APPROVED,
      contents: 'Approved',
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 8. Line
    page.addAnnotation(new PDAnnotationLine({
      rect: [50, 440, 300, 500],
      line: [50, 470, 300, 470],
      color: rgb(0.8, 0, 0),
      lineEndingStyles: [LineEndingStyle.NONE, LineEndingStyle.OPEN_ARROW],
      contents: 'Line with arrow',
      borderWidth: 2,
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 9. Square (Rectangle)
    page.addAnnotation(new PDAnnotationSquare({
      rect: [350, 440, 550, 500],
      color: rgb(0, 0.6, 0),
      borderWidth: 2,
      contents: 'Square annotation',
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 10. Circle (Ellipse)
    page.addAnnotation(new PDAnnotationCircle({
      rect: [50, 340, 200, 420],
      color: rgb(0.6, 0, 0.6),
      borderWidth: 2,
      contents: 'Circle annotation',
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 11. Ink (freehand)
    page.addAnnotation(new PDAnnotationInk({
      rect: [250, 340, 450, 420],
      inkList: [
        [260, 380, 280, 400, 320, 360, 360, 400, 400, 380, 440, 350],
      ],
      color: rgb(0, 0.4, 0.8),
      borderWidth: 2,
      contents: 'Ink annotation',
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // 12. Link
    page.addAnnotation(new PDAnnotationLink({
      rect: [50, 280, 250, 310],
      uri: 'https://example.com',
      borderWidth: 1,
      color: rgb(0, 0, 1),
      flags: ANNOTATION_FLAG_PRINT,
    }));

    // Label the link area
    page.drawText('Click here: https://example.com', {
      x: 55, y: 288, size: 11, font, color: rgb(0, 0, 0.8),
    });

    const pdfBytes = await doc.save();
    const rendered = renderPdfPage(pdfBytes);
    assertSnapshot('annotations-kitchen-sink', rendered);
  });
});
