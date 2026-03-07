/**
 * Redaction preview — shows exactly what will be removed before applying.
 *
 * Usage:
 *   const elements = renderer.getPageElements(0);
 *   const preview = getRedactionPreview(elements, { x: 50, y: 500, width: 200, height: 50 });
 *   console.log(preview.summary);  // human-readable summary
 *   // User confirms -> apply redaction
 */

import type { PageElement, TextElement, ShapeElement, ImageElement } from './types.js';
import { queryElementsInRect, type Rect } from './spatial.js';

export interface RedactionPreview {
  /** Elements that will be removed. */
  elements: PageElement[];
  /** Human-readable summary of what will be removed. */
  summary: string;
  /** Individual element descriptions. */
  descriptions: ElementDescription[];
  /** Total number of affected elements. */
  count: number;
  /** The query rectangle used. */
  rect: Rect;
}

export interface ElementDescription {
  type: string;
  text?: string;           // for text elements: the actual text content
  position: { x: number; y: number };
  size: { width: number; height: number };
  fontInfo?: string;       // e.g. "12pt Helvetica"
  colorInfo?: string;      // e.g. "#ff0000" or "rgb(255,0,0)"
}

/**
 * Preview what a redaction rectangle would remove.
 * Does NOT modify anything — pure query.
 */
export function getRedactionPreview(
  elements: PageElement[],
  rect: Rect,
): RedactionPreview {
  const affected = queryElementsInRect(elements, rect);
  const descriptions = affected.map(describeElement);

  const lines: string[] = [];
  lines.push(`Redacting ${affected.length} element${affected.length === 1 ? '' : 's'}:`);
  for (const desc of descriptions) {
    // Format like:
    //   Text: "Account Number: 1234-5678" at (72, 540) 12pt Helvetica
    //   Shape: at (70, 515) 240x45 filled #ffffff
    //   Path: at (50, 500) 100x30
    //   Image: at (200, 400) 150x100 image/jpeg
    if (desc.type === 'text' && desc.text) {
      const truncated = desc.text.length > 60 ? desc.text.substring(0, 57) + '...' : desc.text;
      lines.push(`  Text: "${truncated}" at (${desc.position.x.toFixed(0)}, ${desc.position.y.toFixed(0)})${desc.fontInfo ? ' ' + desc.fontInfo : ''}`);
    } else if (desc.type === 'shape') {
      lines.push(`  Shape: at (${desc.position.x.toFixed(0)}, ${desc.position.y.toFixed(0)}) ${desc.size.width.toFixed(0)}x${desc.size.height.toFixed(0)}${desc.colorInfo ? ' ' + desc.colorInfo : ''}`);
    } else if (desc.type === 'image') {
      lines.push(`  Image: at (${desc.position.x.toFixed(0)}, ${desc.position.y.toFixed(0)}) ${desc.size.width.toFixed(0)}x${desc.size.height.toFixed(0)}`);
    } else {
      lines.push(`  ${desc.type}: at (${desc.position.x.toFixed(0)}, ${desc.position.y.toFixed(0)}) ${desc.size.width.toFixed(0)}x${desc.size.height.toFixed(0)}`);
    }
  }

  return {
    elements: affected,
    summary: lines.join('\n'),
    descriptions,
    count: affected.length,
    rect,
  };
}

/**
 * Format a redaction preview as a log-friendly string.
 * Useful for console output during redaction.
 */
export function formatRedactionLog(preview: RedactionPreview): string {
  return preview.summary;
}

function describeElement(el: PageElement): ElementDescription {
  const base: ElementDescription = {
    type: el.type,
    position: { x: el.x, y: el.y },
    size: { width: el.width, height: el.height },
  };

  switch (el.type) {
    case 'text': {
      const allText = el.paragraphs
        .flatMap(p => p.runs.map(r => r.text))
        .join('');
      const firstRun = el.paragraphs[0]?.runs[0];
      base.text = allText;
      if (firstRun) {
        base.fontInfo = `${firstRun.fontSize}pt ${firstRun.fontFamily.split(',')[0].replace(/"/g, '')}`;
        base.colorInfo = colorToHex(firstRun.color);
      }
      break;
    }
    case 'shape': {
      const shape = el as ShapeElement;
      if (shape.fill?.color) {
        base.colorInfo = `filled ${colorToHex(shape.fill.color)}`;
      } else if (shape.stroke?.color) {
        base.colorInfo = `stroked ${colorToHex(shape.stroke.color)}`;
      }
      break;
    }
    case 'image': {
      base.text = (el as ImageElement).mimeType;
      break;
    }
  }

  return base;
}

function colorToHex(c: { r: number; g: number; b: number }): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}
