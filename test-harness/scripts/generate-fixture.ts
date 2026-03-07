/**
 * Generate a demo PDF with form fields for the test harness.
 *
 * Creates a 2-page "Wire Transfer Authorization" form with:
 *   - recipient.name (text field)
 *   - amount (text field)
 *   - reference (text field)
 *   - notes (multiline text field)
 *
 * Output: test-harness/public/demo.pdf
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdfbox-ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '..', 'public');
const OUTPUT = path.resolve(PUBLIC, 'demo.pdf');
const OUTPUT_NO_FIELDS = path.resolve(PUBLIC, 'no-fields.pdf');

async function generate() {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // ── Page 1: Form ──────────────────────────────────────────────

  const page1 = doc.addPage([612, 792]); // US Letter

  // Header
  page1.drawRectangle({
    x: 0, y: 742, width: 612, height: 50,
    color: rgb(0.15, 0.25, 0.45),
  });
  page1.drawText('Wire Transfer Authorization', {
    x: 50, y: 758, size: 22, font: helveticaBold, color: rgb(1, 1, 1),
  });

  // Subtitle
  page1.drawText('Please fill in the details below, then sign.', {
    x: 50, y: 710, size: 11, font: helvetica, color: rgb(0.4, 0.4, 0.4),
  });

  // Divider
  page1.drawLine({
    start: { x: 50, y: 695 }, end: { x: 562, y: 695 },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  });

  // Field labels
  const labelX = 50;
  const fieldX = 200;
  const fieldW = 362;
  const fieldH = 24;

  const fields = [
    { label: 'Recipient Name:', name: 'recipient.name', y: 650, multiline: false },
    { label: 'Amount (USD):', name: 'amount', y: 605, multiline: false },
    { label: 'Reference #:', name: 'reference', y: 560, multiline: false },
    { label: 'Notes:', name: 'notes', y: 490, multiline: true },
  ];

  const form = doc.getForm();

  for (const f of fields) {
    page1.drawText(f.label, {
      x: labelX, y: f.y + 5, size: 11, font: helveticaBold, color: rgb(0.2, 0.2, 0.2),
    });

    const textField = form.createTextField(f.name);
    if (f.multiline) {
      textField.enableMultiline();
      textField.addToPage(page1, {
        x: fieldX, y: f.y - 35, width: fieldW, height: 60,
        borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1,
        backgroundColor: rgb(0.98, 0.98, 0.98),
      });
    } else {
      textField.addToPage(page1, {
        x: fieldX, y: f.y - 2, width: fieldW, height: fieldH,
        borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1,
        backgroundColor: rgb(0.98, 0.98, 0.98),
      });
    }
  }

  // Signature area labels
  page1.drawText('Signatures:', {
    x: 50, y: 400, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2),
  });
  page1.drawText('(Signature boxes will be placed here by the signing process)', {
    x: 50, y: 380, size: 9, font: helvetica, color: rgb(0.5, 0.5, 0.5),
  });

  // Signature placeholder boxes
  for (let i = 0; i < 2; i++) {
    const x = 50 + i * 260;
    page1.drawRectangle({
      x, y: 300, width: 240, height: 70,
      borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1,
      color: rgb(0.97, 0.97, 0.97),
    });
    page1.drawText(`User ${i + 1} Signature`, {
      x: x + 60, y: 330, size: 10, font: helvetica, color: rgb(0.7, 0.7, 0.7),
    });
  }

  // Footer
  page1.drawText('Page 1 of 2', {
    x: 280, y: 30, size: 9, font: helvetica, color: rgb(0.6, 0.6, 0.6),
  });

  // ── Page 2: Terms ─────────────────────────────────────────────

  const page2 = doc.addPage([612, 792]);

  page2.drawRectangle({
    x: 0, y: 742, width: 612, height: 50,
    color: rgb(0.15, 0.25, 0.45),
  });
  page2.drawText('Terms and Conditions', {
    x: 50, y: 758, size: 22, font: helveticaBold, color: rgb(1, 1, 1),
  });

  const terms = [
    '1. By signing this document, you authorize the wire transfer described on page 1.',
    '2. All information provided is accurate and complete to the best of your knowledge.',
    '3. The transfer will be processed within 1-3 business days.',
    '4. This authorization is valid for 30 days from the date of signing.',
    '5. Both signers must approve the transfer for it to be processed.',
    '6. The organization reserves the right to verify all details before processing.',
    '7. Cancellation requests must be submitted in writing within 24 hours.',
    '8. This document constitutes a legally binding authorization.',
  ];

  let y = 700;
  for (const term of terms) {
    page2.drawText(term, {
      x: 50, y, size: 11, font: helvetica, color: rgb(0.2, 0.2, 0.2),
      maxWidth: 512,
    });
    y -= 30;
  }

  page2.drawText('Page 2 of 2', {
    x: 280, y: 30, size: 9, font: helvetica, color: rgb(0.6, 0.6, 0.6),
  });

  // ── Save ──────────────────────────────────────────────────────

  const bytes = await doc.save();
  fs.mkdirSync(PUBLIC, { recursive: true });
  fs.writeFileSync(OUTPUT, bytes);
  console.log(`Generated fixture: ${OUTPUT} (${bytes.length} bytes)`);

  // Also generate a simple PDF with no form fields (for E2E test)
  const plain = await PDFDocument.create();
  plain.addPage([612, 792]);
  const plainBytes = await plain.save();
  fs.writeFileSync(OUTPUT_NO_FIELDS, plainBytes);
  console.log(`Generated fixture: ${OUTPUT_NO_FIELDS} (${plainBytes.length} bytes)`);
}

generate().catch((err) => {
  console.error('Failed to generate fixture:', err);
  process.exit(1);
});
