export interface FontVariantEntry {
  file: string; // relative path from package root
  size: number; // file size in bytes
}

export interface FontFamilyEntry {
  displayName: string;
  substituteFor?: string;
  license: string;
  woff2: Record<string, FontVariantEntry>; // key: "{subset}-{weight}-{style}"
  ttf: Record<string, FontVariantEntry>; // key: "regular" | "bold" | "italic" | "boldItalic"
  weights: number[];
  styles: string[];
  subsets: string[];
}

export interface FontManifest {
  version: number;
  families: Record<string, FontFamilyEntry>;
}
