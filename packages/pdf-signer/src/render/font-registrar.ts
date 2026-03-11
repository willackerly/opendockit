/**
 * Font Registrar — registers extracted PDF font bytes with Canvas2D.
 *
 * Supports both Node.js (node-canvas registerFont) and browser (FontFace API)
 * environments. Generates unique family names to avoid collisions and caches
 * registrations to prevent duplicates.
 *
 * Usage:
 *   const registrar = new FontRegistrar();
 *   const family = await registrar.register('ABCDEF+Helvetica-Bold', fontBytes);
 *   // Use `family` in ctx.font = `bold 12px '${family}'`
 *   registrar.cleanup(); // after rendering
 */

import { isNodeEnvironment } from './canvas-factory.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegisteredFont {
  /** The unique family name that was registered with the canvas system. */
  family: string;
  /** Temp file path (Node.js only) — needed for cleanup. */
  tempPath?: string;
  /** FontFace object (browser only) — needed for cleanup. */
  fontFace?: FontFace;
}

// ---------------------------------------------------------------------------
// FontRegistrar
// ---------------------------------------------------------------------------

export class FontRegistrar {
  /** Map from PDF font name/key → registered font info. */
  private cache = new Map<string, RegisteredFont>();

  /** Counter for generating unique names. */
  private counter = 0;

  /**
   * Register font bytes so they can be used in Canvas2D ctx.font.
   *
   * @param pdfFontName  The PDF font name (e.g. 'ABCDEF+Helvetica-Bold')
   * @param fontBytes    Raw TrueType (.ttf) or OpenType (.otf) font data
   * @param options      Optional weight/style hints
   * @returns The registered family name to use in ctx.font
   */
  async register(
    pdfFontName: string,
    fontBytes: Uint8Array,
    options?: { weight?: string; style?: string }
  ): Promise<string> {
    // Check cache — don't re-register the same font
    const cached = this.cache.get(pdfFontName);
    if (cached) {
      return cached.family;
    }

    // Generate unique family name
    const family = this.generateFamilyName(pdfFontName);

    let registered: RegisteredFont;

    if (isNodeEnvironment) {
      registered = await this.registerNode(family, fontBytes, options);
    } else {
      registered = await this.registerBrowser(family, fontBytes, options);
    }

    this.cache.set(pdfFontName, registered);
    return registered.family;
  }

  /**
   * Check if a font has already been registered.
   */
  has(pdfFontName: string): boolean {
    return this.cache.has(pdfFontName);
  }

  /**
   * Get the registered family name for a PDF font, if registered.
   */
  getFamily(pdfFontName: string): string | undefined {
    return this.cache.get(pdfFontName)?.family;
  }

  /**
   * Clean up all registered fonts.
   * - Node.js: deletes temp files (note: node-canvas doesn't support unregistering)
   * - Browser: removes FontFace objects from document.fonts
   */
  async cleanup(): Promise<void> {
    if (isNodeEnvironment) {
      // Delete temp files
      for (const entry of this.cache.values()) {
        if (entry.tempPath) {
          try {
            const fs = await import('fs');
            fs.unlinkSync(entry.tempPath);
          } catch {
            // Ignore cleanup errors — file may already be deleted
          }
        }
      }
    } else {
      // Browser: remove FontFace from document.fonts
      for (const entry of this.cache.values()) {
        if (entry.fontFace && typeof document !== 'undefined') {
          try {
            document.fonts.delete(entry.fontFace);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }

    this.cache.clear();
  }

  /**
   * Number of registered fonts.
   */
  get size(): number {
    return this.cache.size;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /**
   * Generate a unique family name from a PDF font name.
   * Strips subset prefix and special characters, appends a counter for uniqueness.
   *
   * 'ABCDEF+Helvetica-Bold' → '_pdf_helvetica_bold_0'
   */
  private generateFamilyName(pdfFontName: string): string {
    // Strip subset prefix: 'ABCDEF+Helvetica-Bold' → 'Helvetica-Bold'
    const stripped = pdfFontName.replace(/^[A-Z]{6}\+/, '');
    // Normalize: lowercase, replace non-alphanumeric with underscore
    const normalized = stripped.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `_pdf_${normalized}_${this.counter++}`;
  }

  /**
   * Node.js registration: write to temp file, call registerFont.
   */
  private async registerNode(
    family: string,
    fontBytes: Uint8Array,
    options?: { weight?: string; style?: string }
  ): Promise<RegisteredFont> {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    // Write to temp file (registerFont requires a file path)
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `${family}.ttf`);
    fs.writeFileSync(tmpFile, fontBytes);

    // Register with node-canvas
    const { registerFont } = await import('canvas');
    registerFont(tmpFile, {
      family,
      weight: options?.weight ?? 'normal',
      style: options?.style ?? 'normal',
    });

    return { family, tempPath: tmpFile };
  }

  /**
   * Browser registration: create FontFace and add to document.fonts.
   */
  private async registerBrowser(
    family: string,
    fontBytes: Uint8Array,
    options?: { weight?: string; style?: string }
  ): Promise<RegisteredFont> {
    const buffer = fontBytes.buffer.slice(
      fontBytes.byteOffset,
      fontBytes.byteOffset + fontBytes.byteLength
    );

    const fontFace = new FontFace(family, buffer, {
      weight: options?.weight ?? 'normal',
      style: options?.style ?? 'normal',
    });

    await fontFace.load();
    document.fonts.add(fontFace);

    return { family, fontFace };
  }
}
