/**
 * Generate sample signed PDFs for Adobe Reader testing.
 *
 * Usage:
 *   npx tsx scripts/generate-samples.ts
 *
 * Outputs go to samples/ with descriptive filenames.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { fileURLToPath } from 'node:url';

import { signPDFWithPDFBox, preparePdfWithAppearance, signPreparedPdfWithPDFBox } from '../src/signer/pdfbox-signer';
import { getFixtureSigner } from '../src/testing/fixture-signer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const samplesDir = path.resolve(repoRoot, 'samples');

function loadTestPdf(relativePath: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.resolve(repoRoot, relativePath)));
}

/**
 * Create a small 100x40 PNG badge that says "SIGNED" in a blue box.
 * We build a minimal valid PNG programmatically.
 */
function createSignatureBadgePng(): Uint8Array {
  // We'll create a real but simple 100x40 PNG with a blue-ish gradient
  const width = 100;
  const height = 40;

  // Build raw RGBA pixel data (no filter row prefix yet)
  const rawPixels: number[] = [];
  for (let y = 0; y < height; y++) {
    rawPixels.push(0); // filter byte: None
    for (let x = 0; x < width; x++) {
      // Blue gradient background
      const r = 30;
      const g = 60;
      const b = Math.min(255, 120 + Math.floor((x / width) * 100));
      rawPixels.push(r, g, b);
    }
  }

  // Deflate the raw data using Node's zlib
  const deflated = zlib.deflateSync(Buffer.from(rawPixels), { level: 9 });

  // Build PNG file
  const chunks: Buffer[] = [];

  // PNG signature
  chunks.push(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));

  function writeChunk(type: string, data: Buffer) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    chunks.push(len);
    chunks.push(typeBuffer);
    chunks.push(data);
    // CRC over type + data
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = crc32(crcData);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0);
    chunks.push(crcBuf);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  writeChunk('IHDR', ihdr);

  // IDAT
  writeChunk('IDAT', deflated);

  // IEND
  writeChunk('IEND', Buffer.alloc(0));

  return new Uint8Array(Buffer.concat(chunks));
}

/** CRC32 for PNG chunks */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return crc ^ 0xffffffff;
}

let _crc32Table: Uint32Array | null = null;
function getCrc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  _crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    _crc32Table[i] = c >>> 0;
  }
  return _crc32Table;
}

/** Create a fresh single-page PDF with some content */
async function createFreshPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // Letter size
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('Sample Document', {
    x: 50, y: 700, size: 24, font: boldFont, color: rgb(0, 0, 0),
  });
  page.drawText('This document is used to demonstrate pdfbox-ts digital signing capabilities.', {
    x: 50, y: 660, size: 11, font, color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('It was generated programmatically with pdf-lib and signed with pdfbox-ts.', {
    x: 50, y: 640, size: 11, font, color: rgb(0.2, 0.2, 0.2),
  });

  // Add some filler content
  const lines = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor',
    'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud',
    'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    '',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat',
    'nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui',
    'officia deserunt mollit anim id est laborum.',
  ];

  let yPos = 600;
  for (const line of lines) {
    if (line) {
      page.drawText(line, { x: 50, y: yPos, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    }
    yPos -= 16;
  }

  return doc.save();
}

async function main() {
  const signer = getFixtureSigner();
  const sigBadgePng = createSignatureBadgePng();

  console.log('Generating sample PDFs for Adobe Reader testing...\n');

  // ── 1. Single text signature ──────────────────────────────────────────
  {
    const name = '01-single-text-signature.pdf';
    console.log(`  Creating ${name}...`);
    const pdf = await createFreshPdf();
    const result = await signPDFWithPDFBox(pdf, signer, {
      reason: 'Document review and approval',
      location: 'San Francisco, CA',
      signatureAppearance: {
        text: 'Digitally Signed',
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    fs.writeFileSync(path.join(samplesDir, name), result.signedData);
    console.log(`    ✅ ${Math.floor(result.signedData.length / 1024)} KB — Single signature with text appearance`);
  }

  // ── 2. Visual signature with PNG ──────────────────────────────────────
  {
    const name = '02-visual-signature-with-png.pdf';
    console.log(`  Creating ${name}...`);
    const pdf = await createFreshPdf();
    const result = await signPDFWithPDFBox(pdf, signer, {
      reason: 'Approved with visual badge',
      location: 'New York, NY',
      signatureAppearance: {
        imageData: sigBadgePng,
        position: { page: 0, x: 350, y: 50, width: 200, height: 80 },
      },
    });
    fs.writeFileSync(path.join(samplesDir, name), result.signedData);
    console.log(`    ✅ ${Math.floor(result.signedData.length / 1024)} KB — Single signature with embedded PNG image`);
  }

  // ── 3. Two signatures (counter-signed) ────────────────────────────────
  {
    const name = '03-two-signatures-counter-signed.pdf';
    console.log(`  Creating ${name}...`);
    const pdf = await createFreshPdf();
    // First signer
    const first = await signPDFWithPDFBox(pdf, signer, {
      reason: 'First signer approval',
      signatureAppearance: {
        text: 'Signer 1: Approved',
        fieldName: 'Signature1',
        position: { page: 0, x: 50, y: 100, width: 200, height: 50 },
      },
    });
    // Second signer (counter-sign)
    const second = await signPDFWithPDFBox(first.signedData, signer, {
      reason: 'Second signer verification',
      signatureAppearance: {
        text: 'Signer 2: Verified',
        fieldName: 'Signature2',
        position: { page: 0, x: 300, y: 100, width: 200, height: 50 },
      },
    });
    fs.writeFileSync(path.join(samplesDir, name), second.signedData);
    console.log(`    ✅ ${Math.floor(second.signedData.length / 1024)} KB — Two signatures (sequential counter-sign)`);
  }

  // ── 4. Two signatures, second has PNG visual ──────────────────────────
  {
    const name = '04-two-signatures-second-has-png.pdf';
    console.log(`  Creating ${name}...`);
    const pdf = await createFreshPdf();
    // First signer (text)
    const first = await signPDFWithPDFBox(pdf, signer, {
      reason: 'Initial approval',
      signatureAppearance: {
        text: 'Signer 1: Approved',
        fieldName: 'Signature1',
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    // Second signer (PNG visual badge)
    const second = await signPDFWithPDFBox(first.signedData, signer, {
      reason: 'Final approval with badge',
      signatureAppearance: {
        imageData: sigBadgePng,
        fieldName: 'Signature2',
        position: { page: 0, x: 350, y: 50, width: 200, height: 80 },
      },
    });
    fs.writeFileSync(path.join(samplesDir, name), second.signedData);
    console.log(`    ✅ ${Math.floor(second.signedData.length / 1024)} KB — Two signatures, second has PNG visual`);
  }

  // ── 5. Real-world PDF signed (wire-instructions fixture) ──────────────
  {
    const name = '05-real-world-wire-instructions-signed.pdf';
    console.log(`  Creating ${name}...`);
    const pdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    const result = await signPDFWithPDFBox(pdf, signer, {
      reason: 'Wire transfer authorization',
      location: 'Remote',
      signatureAppearance: {
        text: 'Authorized',
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    fs.writeFileSync(path.join(samplesDir, name), result.signedData);
    console.log(`    ✅ ${Math.floor(result.signedData.length / 1024)} KB — Real wire-instructions PDF, signed`);
  }

  // ── 6. Already-signed PDF counter-signed ──────────────────────────────
  {
    const name = '06-pre-signed-then-counter-signed.pdf';
    console.log(`  Creating ${name}...`);
    const pdf = loadTestPdf('test-pdfs/working/wire-instructions-signed.pdf');
    const result = await signPDFWithPDFBox(pdf, signer, {
      reason: 'Counter-signature on pre-signed document',
      signatureAppearance: {
        text: 'Counter-signed',
        position: { page: 0, x: 50, y: 120, width: 200, height: 50 },
      },
    });
    fs.writeFileSync(path.join(samplesDir, name), result.signedData);
    console.log(`    ✅ ${Math.floor(result.signedData.length / 1024)} KB — Pre-signed PDF with added counter-signature`);
  }

  // ── 7. Prepare/sign two-step API demo ─────────────────────────────────
  {
    const name = '07-two-step-prepare-then-sign.pdf';
    console.log(`  Creating ${name}...`);
    const pdf = await createFreshPdf();
    const prepared = await preparePdfWithAppearance(pdf, signer, {
      reason: 'Two-step signing demo',
      signatureAppearance: {
        imageData: sigBadgePng,
        position: { page: 0, x: 350, y: 680, width: 200, height: 80 },
      },
    });
    const result = await signPreparedPdfWithPDFBox(prepared, signer, {
      reason: 'Two-step signing demo',
    });
    fs.writeFileSync(path.join(samplesDir, name), result.signedData);
    console.log(`    ✅ ${Math.floor(result.signedData.length / 1024)} KB — Two-step API (prepare → sign)`);
  }

  console.log(`\n✅ All samples written to ${samplesDir}/`);
  console.log('\nOpen these in Adobe Reader to verify:');
  console.log('  - Signature panel shows valid signatures');
  console.log('  - Visual appearance (text / PNG badge) renders correctly');
  console.log('  - Counter-signed PDFs show both signatures');
  console.log('  - ByteRange covers entire document (no tampering warnings)');
}

main().catch((e) => {
  console.error('Failed to generate samples:', e);
  process.exit(1);
});
