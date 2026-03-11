/**
 * Type declarations for the optional @opendockit/fonts companion package.
 *
 * This module may or may not be installed at runtime. It is imported
 * dynamically with a try/catch in bundled-font-loader.ts and ttf-loader.ts.
 */
declare module '@opendockit/fonts' {
  interface FontVariantEntry {
    file: string;
    size: number;
  }

  interface FontFamilyEntry {
    displayName: string;
    substituteFor?: string;
    license: string;
    woff2: Record<string, FontVariantEntry>;
    ttf: Record<string, FontVariantEntry>;
    weights: number[];
    styles: string[];
    subsets: string[];
  }

  interface FontManifest {
    version: number;
    families: Record<string, FontFamilyEntry>;
  }

  export function getManifest(): FontManifest;
  export function getBasePath(): string;
  export function registerOfflineFonts(families?: string[]): Promise<void>;
}
