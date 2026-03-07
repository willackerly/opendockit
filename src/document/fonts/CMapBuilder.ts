/**
 * CMapBuilder — generates PostScript CMap syntax for ToUnicode mapping.
 *
 * Maps glyph IDs (CID values) to Unicode code points, enabling
 * copy/paste and text extraction in PDF viewers.
 */

/**
 * Build a ToUnicode CMap stream mapping glyph IDs -> Unicode code points.
 * Groups entries into bfchar blocks of 100 (PDF spec limit per block).
 */
export function buildToUnicodeCMap(glyphToUnicode: Map<number, number>): string {
  // Sort entries by glyph ID for deterministic output
  const entries = Array.from(glyphToUnicode.entries()).sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) {
    return [
      '/CIDInit /ProcSet findresource begin',
      '12 dict begin',
      'begincmap',
      '/CIDSystemInfo',
      '<< /Registry (Adobe)',
      '/Ordering (UCS)',
      '/Supplement 0',
      '>> def',
      '/CMapName /Adobe-Identity-UCS def',
      '/CMapType 2 def',
      '1 begincodespacerange',
      '<0000> <FFFF>',
      'endcodespacerange',
      '0 beginbfchar',
      'endbfchar',
      'endcmap',
      'CMapName currentdict /CMap defineresource pop',
      'end',
      'end',
    ].join('\n');
  }

  const lines: string[] = [];
  lines.push('/CIDInit /ProcSet findresource begin');
  lines.push('12 dict begin');
  lines.push('begincmap');
  lines.push('/CIDSystemInfo');
  lines.push('<< /Registry (Adobe)');
  lines.push('/Ordering (UCS)');
  lines.push('/Supplement 0');
  lines.push('>> def');
  lines.push('/CMapName /Adobe-Identity-UCS def');
  lines.push('/CMapType 2 def');
  lines.push('1 begincodespacerange');
  lines.push('<0000> <FFFF>');
  lines.push('endcodespacerange');

  // Split into blocks of 100 (PDF spec limit per bfchar block)
  for (let i = 0; i < entries.length; i += 100) {
    const block = entries.slice(i, i + 100);
    lines.push(`${block.length} beginbfchar`);
    for (const [glyphId, unicode] of block) {
      const gidHex = glyphId.toString(16).toUpperCase().padStart(4, '0');
      const uniHex = unicode.toString(16).toUpperCase().padStart(4, '0');
      lines.push(`<${gidHex}> <${uniHex}>`);
    }
    lines.push('endbfchar');
  }

  lines.push('endcmap');
  lines.push('CMapName currentdict /CMap defineresource pop');
  lines.push('end');
  lines.push('end');

  return lines.join('\n');
}
