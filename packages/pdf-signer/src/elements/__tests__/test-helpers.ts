/**
 * Shared mock element factories for element model tests.
 */

import type { TextElement, ShapeElement, ImageElement } from '../types.js';
import type { Viewport } from '../interaction-types.js';

export const baseProps = {
  rotation: 0,
  opacity: 1,
  index: '0',
  parentId: null,
  locked: false,
};

export function makeTextElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
): TextElement {
  return {
    ...baseProps,
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    paragraphs: [
      {
        runs: [
          {
            text,
            fontFamily: 'Helvetica',
            fontSize: 12,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 0,
            width,
            height,
          },
        ],
      },
    ],
  };
}

export function makeShapeElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ShapeElement {
  return {
    ...baseProps,
    id,
    type: 'shape',
    x,
    y,
    width,
    height,
    shapeType: 'rectangle',
    fill: null,
    stroke: null,
  };
}

export function makeImageElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageElement {
  return {
    ...baseProps,
    id,
    type: 'image',
    x,
    y,
    width,
    height,
    imageRef: 'img1',
    mimeType: 'image/png',
    objectFit: 'fill',
  };
}

export const DEFAULT_VIEWPORT: Viewport = {
  scale: 1,
  pageWidth: 612,
  pageHeight: 792,
};
