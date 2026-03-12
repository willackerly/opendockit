/**
 * Variable font utilities — CSS font-variation-settings generation
 * and weight/width/slant axis mapping.
 */

/** Known font variation axes. */
export interface VariationAxes {
  /** Weight axis (wght): 100-900. */
  weight?: number;
  /** Width axis (wdth): 50-200 (percentage of normal). */
  width?: number;
  /** Slant axis (slnt): degrees, typically -12 to 0. */
  slant?: number;
  /** Italic axis (ital): 0 or 1. */
  italic?: number;
  /** Optical size (opsz): point size. */
  opticalSize?: number;
}

/** Maps axis names to their CSS tag. */
const AXIS_TAGS: Record<keyof VariationAxes, string> = {
  weight: 'wght',
  width: 'wdth',
  slant: 'slnt',
  italic: 'ital',
  opticalSize: 'opsz',
};

/**
 * Generate CSS font-variation-settings string from axes.
 * E.g., "'wght' 700, 'wdth' 100, 'slnt' -12"
 *
 * Returns empty string if no axes are specified.
 */
export function variationSettingsCSS(axes: VariationAxes): string {
  const parts: string[] = [];
  for (const [key, tag] of Object.entries(AXIS_TAGS)) {
    const value = axes[key as keyof VariationAxes];
    if (value !== undefined) {
      parts.push(`'${tag}' ${value}`);
    }
  }
  return parts.join(', ');
}

/**
 * Map a font style (bold, italic, weight number) to variation axes.
 * Used when registering a variable font to generate the right CSS.
 */
export function styleToVariationAxes(
  weight: number | 'normal' | 'bold',
  italic: boolean,
): VariationAxes {
  const axes: VariationAxes = {};

  if (weight === 'bold') {
    axes.weight = 700;
  } else if (weight === 'normal') {
    axes.weight = 400;
  } else {
    axes.weight = weight;
  }

  if (italic) {
    axes.italic = 1;
  }

  return axes;
}

/**
 * Check if a font family name suggests a variable font.
 * Variable fonts typically have "[wght]" or "[wght,wdth]" in the filename,
 * or are named with "-VariableFont" suffix.
 */
export function isVariableFontFilename(filename: string): boolean {
  // Match bracketed axis tags like [wght] or [wght,wdth,ital]
  if (/\[[\w,]+\]/.test(filename)) return true;
  // Match -VariableFont suffix (case-insensitive)
  if (/-variablefont/i.test(filename)) return true;
  return false;
}
