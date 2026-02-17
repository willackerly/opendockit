/**
 * Font availability checking and loading.
 *
 * Uses browser-only APIs (document.fonts, FontFace) with graceful
 * degradation in Node.js / test environments.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a font is available in the current environment.
 * Uses document.fonts.check() in browsers, returns false in Node.js.
 *
 * @param fontName - font family name to check
 * @param fontSize - font size in px for the check (default 16)
 * @returns true if the font is available
 */
export function isFontAvailable(fontName: string, fontSize = 16): boolean {
  if (typeof document === 'undefined' || !document.fonts) {
    return false;
  }

  try {
    return document.fonts.check(`${fontSize}px '${fontName}'`);
  } catch {
    return false;
  }
}

/**
 * Load a font from binary data (e.g., embedded in an OOXML package).
 * Uses the FontFace API in browsers, no-op in Node.js.
 *
 * @param fontName - name to register the font under
 * @param data - font file contents (TTF/OTF/WOFF)
 * @param descriptors - optional FontFace descriptors (style, weight, etc.)
 * @returns true if the font was successfully loaded and registered
 */
export async function loadFont(
  fontName: string,
  data: ArrayBuffer,
  descriptors?: FontFaceDescriptors
): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  try {
    const face = new FontFace(fontName, data, descriptors);
    await face.load();
    document.fonts.add(face);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to load a font and register it. Returns true if loaded.
 * If the font is already available, skips loading and returns true.
 *
 * @param fontName - name to register the font under
 * @param data - font file contents (TTF/OTF/WOFF)
 * @returns true if the font is now available
 */
export async function ensureFontLoaded(fontName: string, data: ArrayBuffer): Promise<boolean> {
  if (isFontAvailable(fontName)) {
    return true;
  }

  return loadFont(fontName, data);
}
