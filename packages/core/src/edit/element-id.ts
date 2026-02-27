/**
 * Stable element ID generation from OOXML shape IDs.
 *
 * OOXML shape IDs (p:cNvPr/@id) are only unique within a slide part.
 * We combine partUri + shapeId to get globally unique IDs across the
 * entire presentation.
 *
 * Format: `{partUri}#{shapeId}`, e.g. `/ppt/slides/slide1.xml#42`
 */

/**
 * Generate a stable, unique element ID from the OOXML shape ID and part URI.
 *
 * @param partUri  - OPC part URI, e.g. "/ppt/slides/slide1.xml"
 * @param shapeId  - Shape ID from p:cNvPr/@id (string or number)
 * @returns Composite ID in the format `partUri#shapeId`
 */
export function makeElementId(
  partUri: string,
  shapeId: string | number,
): string {
  return `${partUri}#${shapeId}`;
}

/**
 * Extract the part URI from a composite element ID.
 *
 * @throws Error if the ID does not contain a '#' separator
 */
export function getPartFromElementId(elementId: string): string {
  const hashIndex = elementId.indexOf('#');
  if (hashIndex === -1) throw new Error(`Invalid element ID: ${elementId}`);
  return elementId.substring(0, hashIndex);
}

/**
 * Extract the shape ID from a composite element ID.
 *
 * @throws Error if the ID does not contain a '#' separator
 */
export function getShapeIdFromElementId(elementId: string): string {
  const hashIndex = elementId.indexOf('#');
  if (hashIndex === -1) throw new Error(`Invalid element ID: ${elementId}`);
  return elementId.substring(hashIndex + 1);
}
