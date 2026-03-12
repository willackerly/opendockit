/**
 * Font Registrar — registers extracted PDF font bytes with Canvas2D.
 *
 * Supports both Node.js (node-canvas registerFont) and browser (FontFace API)
 * environments. Generates unique family names to avoid collisions and caches
 * registrations to prevent duplicates.
 *
 * Font patching is handled by the pure-TS font-patcher module — no external
 * dependencies (python3/fonttools) required.
 *
 * Usage:
 *   const registrar = new FontRegistrar();
 *   const family = await registrar.register('ABCDEF+Helvetica-Bold', fontBytes);
 *   // Use `family` in ctx.font = `bold 12px '${family}'`
 *   registrar.cleanup(); // after rendering
 */

import { isNodeEnvironment } from './canvas-factory.js';
import { patchFont, detectFontType } from './font-patcher.js';

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

export interface FontRegistrarOptions {
  weight?: string;
  style?: string;
  fontType?: string;
  charCodeToUnicode?: Map<number, string>;
  metrics?: {
    ascender: number;
    descender: number;
    unitsPerEm: number;
    numGlyphs?: number;
    advanceWidths?: Uint16Array;
  };
}

/**
 * Interface for an external font resolver that can receive extracted fonts.
 * Matches FontResolver from @opendockit/core without importing it directly
 * (pdf-signer does not depend on core).
 */
export interface ExternalFontResolver {
  registerExtractedFont(
    family: string,
    data: ArrayBuffer | Uint8Array,
    weight?: number,
    style?: 'normal' | 'italic'
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// FontRegistrar
// ---------------------------------------------------------------------------

export class FontRegistrar {
  /** Map from PDF font name/key → registered font info. */
  private cache = new Map<string, RegisteredFont>();

  /** Counter for generating unique names. */
  private counter = 0;

  /** Optional external font resolver for unified font pipeline. */
  private _externalResolver: ExternalFontResolver | null = null;

  /**
   * Set an external font resolver. When set, every registered font will also
   * be fed to the resolver via `registerExtractedFont()`, creating a bridge
   * between PDF font extraction and the unified font pipeline.
   */
  setExternalResolver(resolver: ExternalFontResolver | null): void {
    this._externalResolver = resolver;
  }

  /**
   * Register font bytes so they can be used in Canvas2D ctx.font.
   *
   * @param pdfFontName  The PDF font name (e.g. 'ABCDEF+Helvetica-Bold')
   * @param fontBytes    Raw TrueType (.ttf) or OpenType (.otf) font data
   * @param options      Optional weight/style hints and charCodeToUnicode
   * @returns The registered family name to use in ctx.font
   */
  async register(
    pdfFontName: string,
    fontBytes: Uint8Array,
    options?: FontRegistrarOptions
  ): Promise<string> {
    // Check cache — don't re-register the same font
    const cached = this.cache.get(pdfFontName);
    if (cached) {
      return cached.family;
    }

    // Generate unique family name
    const family = this.generateFamilyName(pdfFontName);

    // Patch the font using pure-TS patcher (fixes magic, OS/2, name, cmap)
    const { bytes: patchedBytes } = patchFont(
      fontBytes,
      family,
      options?.fontType,
      options?.charCodeToUnicode,
      options?.metrics
    );

    let registered: RegisteredFont;

    if (isNodeEnvironment) {
      registered = await this.registerNode(family, patchedBytes, options);
    } else {
      registered = await this.registerBrowser(family, patchedBytes, options);
    }

    this.cache.set(pdfFontName, registered);

    // Bridge: feed extracted font to external resolver if configured
    if (this._externalResolver) {
      const weight = this._parseCssWeight(options?.weight);
      const style = (options?.style === 'italic' ? 'italic' : 'normal') as 'normal' | 'italic';
      try {
        await this._externalResolver.registerExtractedFont(
          registered.family,
          patchedBytes,
          weight,
          style
        );
      } catch {
        // External resolver failure is non-fatal — font is still registered locally
      }
    }

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
            (document.fonts as any).delete(entry.fontFace);
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
    options?: FontRegistrarOptions
  ): Promise<RegisteredFont> {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    // Detect file extension from patched bytes
    const detected = detectFontType(fontBytes);
    const ext = detected === 'CFF-OTF' || detected === 'CFF-raw' ? '.otf' : '.ttf';
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `${family}${ext}`);

    // Write patched bytes to temp file
    fs.writeFileSync(tmpFile, fontBytes);

    // Register with node-canvas
    const { registerFont } = await import('canvas');
    registerFont(tmpFile, {
      family,
      weight: options?.weight ?? 'normal',
      style: options?.style ?? 'normal',
    });

    // Keep temp file until cleanup (don't delete immediately)
    return { family, tempPath: tmpFile };
  }

  /**
   * Browser registration: create FontFace and add to document.fonts.
   * Font bytes are already patched by the caller.
   */
  private async registerBrowser(
    family: string,
    fontBytes: Uint8Array,
    options?: FontRegistrarOptions
  ): Promise<RegisteredFont> {
    const buffer = fontBytes.buffer.slice(
      fontBytes.byteOffset,
      fontBytes.byteOffset + fontBytes.byteLength
    );

    const fontFace = new FontFace(family, buffer as ArrayBuffer, {
      weight: options?.weight ?? 'normal',
      style: options?.style ?? 'normal',
    });

    await fontFace.load();
    (document.fonts as any).add(fontFace);

    return { family, fontFace };
  }

  /**
   * Parse a CSS weight string to a numeric value.
   * 'bold' → 700, 'normal' → 400, '600' → 600, etc.
   */
  private _parseCssWeight(weight?: string): number {
    if (!weight || weight === 'normal') return 400;
    if (weight === 'bold') return 700;
    const n = parseInt(weight, 10);
    return isNaN(n) ? 400 : n;
  }
}
