/**
 * Font discovery utilities for scanning OOXML parts.
 *
 * Extracts font family names from raw XML text by regex-matching
 * `typeface="..."` attributes. This catches fonts declared in `<a:latin>`,
 * `<a:ea>`, `<a:cs>`, `<a:buFont>`, `<a:defRPr>`, `<p:txStyles>`,
 * `<a:lstStyle>`, and per-run overrides — without requiring a full DOM parse.
 */

const typefaceRe = /typeface="([^"]+)"/g;
const themeRefRe = /^\+m[jn]-/; // +mj-lt, +mn-lt, +mj-ea, etc.

/**
 * Scan raw XML text for `typeface="..."` attributes.
 * Returns a sorted, deduplicated array of font family names,
 * excluding theme references (+mj-lt, +mn-lt, etc.) and empty values.
 */
export function scanXmlForTypefaces(xml: string): string[] {
  const families = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset lastIndex in case the regex was used before (it's module-level)
  typefaceRe.lastIndex = 0;

  while ((match = typefaceRe.exec(xml)) !== null) {
    const face = match[1];
    if (face && !themeRefRe.test(face)) {
      families.add(face);
    }
  }

  return [...families].sort();
}
