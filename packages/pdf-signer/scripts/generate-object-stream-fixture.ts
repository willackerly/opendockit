import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfDoc = await PDFDocument.create({ useObjectStreams: true });
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('Object Stream Fixture', {
    x: 72,
    y: 700,
    size: 24,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText('This PDF uses object streams/xref streams for parity testing.', {
    x: 72,
    y: 660,
    size: 14,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const outPath = path.join(process.cwd(), 'test-pdfs', 'working', 'object-stream.pdf');
  await fs.writeFile(outPath, bytes);
  console.log(`Wrote object stream fixture to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
