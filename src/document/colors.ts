/**
 * Color types and factory functions.
 * Native implementation — structurally identical to pdf-lib's Color API.
 */

export enum ColorTypes {
  Grayscale = 'Grayscale',
  RGB = 'RGB',
  CMYK = 'CMYK',
}

export interface Grayscale {
  type: ColorTypes.Grayscale;
  gray: number;
}

export interface RGB {
  type: ColorTypes.RGB;
  red: number;
  green: number;
  blue: number;
}

export interface CMYK {
  type: ColorTypes.CMYK;
  cyan: number;
  magenta: number;
  yellow: number;
  key: number;
}

export type Color = Grayscale | RGB | CMYK;

export const grayscale = (gray: number): Grayscale => ({
  type: ColorTypes.Grayscale,
  gray,
});

export const rgb = (red: number, green: number, blue: number): RGB => ({
  type: ColorTypes.RGB,
  red,
  green,
  blue,
});

export const cmyk = (
  cyan: number,
  magenta: number,
  yellow: number,
  key: number,
): CMYK => ({
  type: ColorTypes.CMYK,
  cyan,
  magenta,
  yellow,
  key,
});

export const colorToComponents = (color: Color): number[] => {
  if (color.type === ColorTypes.Grayscale) return [color.gray];
  if (color.type === ColorTypes.RGB) return [color.red, color.green, color.blue];
  return [color.cyan, color.magenta, color.yellow, color.key];
};

export const componentsToColor = (
  comps?: number[],
  scale = 1,
): Color | undefined => {
  if (!comps) return undefined;
  if (comps.length === 1) return grayscale(comps[0] * scale);
  if (comps.length === 3)
    return rgb(comps[0] * scale, comps[1] * scale, comps[2] * scale);
  if (comps.length === 4)
    return cmyk(
      comps[0] * scale,
      comps[1] * scale,
      comps[2] * scale,
      comps[3] * scale,
    );
  return undefined;
};
