/**
 * XMPMetadata — generates XMP (Extensible Metadata Platform) XML for PDF/A.
 *
 * PDF/A requires a /Metadata stream on the catalog containing XMP with:
 *   - pdfaid:part (1 or 2) and pdfaid:conformance (B)
 *   - Standard Dublin Core (dc:) and XMP (xmp:) properties
 *   - Consistency with the /Info dictionary
 *
 * The XMP packet is wrapped in the standard processing instruction envelope:
 *   <?xpacket begin="..." id="W5M0MpCehiHzreSzNTczkc9d"?>
 *   <x:xmpmeta ...> ... </x:xmpmeta>
 *   <?xpacket end="w"?>
 */

export interface XMPMetadataOptions {
  /** PDF/A part number: 1 for PDF/A-1b, 2 for PDF/A-2b, 3 for PDF/A-3b. */
  part: number;
  /** PDF/A conformance level: 'B' for basic visual preservation. */
  conformance: string;
  /** Document title. */
  title?: string;
  /** Document author. */
  author?: string;
  /** Document subject/description. */
  subject?: string;
  /** Creator tool (application that created the document). */
  creator?: string;
  /** Producer tool (library that produced the PDF). */
  producer?: string;
  /** Creation date (ISO 8601). */
  createDate?: Date;
  /** Modification date (ISO 8601). */
  modifyDate?: Date;
  /** Keywords. */
  keywords?: string;
}

/**
 * Generate an XMP metadata XML string for PDF/A compliance.
 *
 * The output is a complete XMP packet including the xpacket processing
 * instructions and padding (2048 bytes of whitespace for in-place updates).
 */
export function generateXMPMetadata(options: XMPMetadataOptions): string {
  const {
    part,
    conformance,
    title,
    author,
    subject,
    creator,
    producer,
    createDate,
    modifyDate,
    keywords,
  } = options;

  // Build the RDF description content
  const lines: string[] = [];

  // Dublin Core (dc:) namespace properties
  if (title) {
    lines.push(`      <dc:title>`);
    lines.push(`        <rdf:Alt>`);
    lines.push(`          <rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li>`);
    lines.push(`        </rdf:Alt>`);
    lines.push(`      </dc:title>`);
  }
  if (author) {
    lines.push(`      <dc:creator>`);
    lines.push(`        <rdf:Seq>`);
    lines.push(`          <rdf:li>${escapeXml(author)}</rdf:li>`);
    lines.push(`        </rdf:Seq>`);
    lines.push(`      </dc:creator>`);
  }
  if (subject) {
    lines.push(`      <dc:description>`);
    lines.push(`        <rdf:Alt>`);
    lines.push(`          <rdf:li xml:lang="x-default">${escapeXml(subject)}</rdf:li>`);
    lines.push(`        </rdf:Alt>`);
    lines.push(`      </dc:description>`);
  }

  // XMP basic (xmp:) namespace properties
  if (creator) {
    lines.push(`      <xmp:CreatorTool>${escapeXml(creator)}</xmp:CreatorTool>`);
  }
  if (producer) {
    lines.push(`      <xmp:MetadataDate>${formatIso8601(modifyDate ?? new Date())}</xmp:MetadataDate>`);
  }
  if (createDate) {
    lines.push(`      <xmp:CreateDate>${formatIso8601(createDate)}</xmp:CreateDate>`);
  }
  if (modifyDate) {
    lines.push(`      <xmp:ModifyDate>${formatIso8601(modifyDate)}</xmp:ModifyDate>`);
  }

  // PDF properties (pdf:)
  if (producer) {
    lines.push(`      <pdf:Producer>${escapeXml(producer)}</pdf:Producer>`);
  }
  if (keywords) {
    lines.push(`      <pdf:Keywords>${escapeXml(keywords)}</pdf:Keywords>`);
  }

  const dcContent = lines.join('\n');

  // Build the complete XMP packet
  // BOM (byte order mark) U+FEFF is required by the XMP spec for xpacket begin
  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>${part}</pdfaid:part>
      <pdfaid:conformance>${escapeXml(conformance)}</pdfaid:conformance>
${dcContent}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
${generatePadding(2048)}
<?xpacket end="w"?>`;

  return xmp;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape XML special characters. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a Date as ISO 8601 (YYYY-MM-DDTHH:mm:ssZ). */
function formatIso8601(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Generate whitespace padding for the XMP packet.
 * This allows in-place updates without rewriting the entire metadata stream.
 * Standard practice is ~2KB of padding (spaces + newlines).
 */
function generatePadding(bytes: number): string {
  // Each line is 100 spaces + newline = 101 chars
  const lineCount = Math.ceil(bytes / 101);
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(' '.repeat(100));
  }
  return lines.join('\n');
}
