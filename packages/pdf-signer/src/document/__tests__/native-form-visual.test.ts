import { describe, it, beforeAll } from 'vitest';

import { PDFDocument } from '../../document/PDFDocument';
import { StandardFonts } from '../../document/StandardFonts';
import { rgb } from '../../document/colors';
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

describe.skipIf(skipVisual)('native form visual rendering', () => {
  beforeAll(() => {
    if (!isPdftoppmAvailable()) {
      throw new Error('pdftoppm not available — cannot run visual rendering tests');
    }
  });

  it('created form fields — text + checkbox + dropdown', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([612, 792]);

    // Header
    page.drawRectangle({
      x: 0, y: 742, width: 612, height: 50,
      color: rgb(0.15, 0.25, 0.45),
    });
    page.drawText('Form Fields Visual Test', {
      x: 50, y: 758, size: 22, font: boldFont, color: rgb(1, 1, 1),
    });

    const form = doc.getForm();

    // Text field with value
    page.drawText('Name:', {
      x: 50, y: 670, size: 12, font: boldFont, color: rgb(0.2, 0.2, 0.2),
    });
    const nameField = form.createTextField('name');
    nameField.setText('John Doe');
    nameField.addToPage(page);

    // Checkbox (checked)
    page.drawText('Agree:', {
      x: 50, y: 620, size: 12, font: boldFont, color: rgb(0.2, 0.2, 0.2),
    });
    const agreeField = form.createCheckBox('agree');
    agreeField.check();
    agreeField.addToPage(page);

    // Dropdown with selection
    page.drawText('Country:', {
      x: 50, y: 570, size: 12, font: boldFont, color: rgb(0.2, 0.2, 0.2),
    });
    const countryField = form.createDropdown('country');
    countryField.setOptions(['USA', 'Canada', 'UK']);
    countryField.select('Canada');
    countryField.addToPage(page);

    const pdfBytes = await doc.save();
    const rendered = renderPdfPage(pdfBytes);
    assertSnapshot('native-form-created', rendered);
  });

  it('flattened form — values baked into page', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([612, 792]);

    // Header
    page.drawRectangle({
      x: 0, y: 742, width: 612, height: 50,
      color: rgb(0.15, 0.25, 0.45),
    });
    page.drawText('Flattened Form Visual Test', {
      x: 50, y: 758, size: 22, font: boldFont, color: rgb(1, 1, 1),
    });

    const form = doc.getForm();

    // Text field with value
    page.drawText('Name:', {
      x: 50, y: 670, size: 12, font: boldFont, color: rgb(0.2, 0.2, 0.2),
    });
    const nameField = form.createTextField('name');
    nameField.setText('Flattened Value');
    nameField.addToPage(page);

    // Checkbox (checked)
    page.drawText('Agree:', {
      x: 50, y: 620, size: 12, font: boldFont, color: rgb(0.2, 0.2, 0.2),
    });
    const agreeField = form.createCheckBox('agree');
    agreeField.check();
    agreeField.addToPage(page);

    // Flatten the form
    form.flatten();

    const pdfBytes = await doc.save();
    const rendered = renderPdfPage(pdfBytes);
    assertSnapshot('native-form-flattened', rendered);
  });
});
