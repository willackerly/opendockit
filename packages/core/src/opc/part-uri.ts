/**
 * OPC Part URI normalization and resolution utilities.
 *
 * Part URIs in OPC packages are absolute paths within the ZIP container.
 * This module handles normalization (leading /, no double slashes, dot
 * segment resolution) and resolution of relative targets against source
 * parts — essential for relationship traversal.
 *
 * Reference: ECMA-376 Part 2, §8 (OPC Part Naming).
 */

/**
 * Normalize a part URI: ensure leading /, collapse //, resolve . and ..
 *
 * JSZip stores paths WITHOUT a leading slash, so callers should pass
 * raw ZIP entry names through this function.
 */
export function normalizePartUri(uri: string): string {
  // Ensure leading slash
  let normalized = uri.startsWith('/') ? uri : '/' + uri;

  // Collapse double slashes
  normalized = normalized.replace(/\/\/+/g, '/');

  // Resolve . and .. segments
  const segments = normalized.split('/');
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === '.') {
      continue;
    } else if (seg === '..') {
      // Pop last segment (but keep root empty string)
      if (resolved.length > 1) {
        resolved.pop();
      }
    } else {
      resolved.push(seg);
    }
  }

  normalized = resolved.join('/');

  // Ensure we still have a leading slash
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  return normalized;
}

/**
 * Resolve a relative target URI against a source part URI.
 *
 * For example, resolving `'../theme/theme1.xml'` against
 * `'/ppt/slides/slide1.xml'` yields `'/ppt/theme/theme1.xml'`.
 */
export function resolvePartUri(sourcePart: string, relativeTarget: string): string {
  // If the target is already absolute, just normalize
  if (relativeTarget.startsWith('/')) {
    return normalizePartUri(relativeTarget);
  }

  // Get the directory of the source part and append the relative target
  const dir = getPartDirectory(sourcePart);
  return normalizePartUri(dir + '/' + relativeTarget);
}

/**
 * Get the directory of a part URI.
 *
 * Example: `'/ppt/slides/slide1.xml'` returns `'/ppt/slides'`
 */
export function getPartDirectory(partUri: string): string {
  const lastSlash = partUri.lastIndexOf('/');
  if (lastSlash <= 0) {
    return '/';
  }
  return partUri.substring(0, lastSlash);
}

/**
 * Get the relationship file path for a given part.
 *
 * Example: `'/ppt/slides/slide1.xml'` returns
 * `'/ppt/slides/_rels/slide1.xml.rels'`
 */
export function getRelationshipPartUri(partUri: string): string {
  const dir = getPartDirectory(partUri);
  const filename = partUri.substring(partUri.lastIndexOf('/') + 1);
  return dir + '/_rels/' + filename + '.rels';
}

/**
 * Get the root relationships path.
 *
 * The root .rels file is always at `/_rels/.rels`.
 */
export function getRootRelationshipUri(): string {
  return '/_rels/.rels';
}
