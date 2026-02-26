/**
 * Diagram drawing fallback parser for SmartArt.
 *
 * Parses pre-rendered SmartArt fallback shapes from `dsp:drawing` parts
 * (content type `application/vnd.ms-office.drawingml.diagramDrawing+xml`).
 *
 * SmartArt diagrams in OOXML are complex (dgm: namespace with a full layout
 * engine). However, PowerPoint saves a pre-rendered fallback as regular
 * DrawingML shapes inside a `drawing*.xml` part using the `dsp:` namespace.
 * This module extracts those shapes so we get SmartArt rendering "for free"
 * without building a diagram layout engine.
 *
 * The `dsp:` namespace structure mirrors standard PresentationML:
 * - `dsp:sp` ≈ `p:sp` (shapes)
 * - `dsp:spPr` ≈ `p:spPr` (shape properties, contains standard `a:*` children)
 * - `dsp:txBody` ≈ `p:txBody` (text body, contains standard `a:*` children)
 * - `dsp:style` ≈ `p:style` (style references)
 * - `dsp:spTree` ≈ `p:spTree` (shape tree container)
 *
 * Reference: MS-ODRAWXML §2.5.1 (Drawing Diagram Drawing Part)
 */

import type { XmlElement } from '../../xml/index.js';
import type { ThemeIR, SlideElementIR, DrawingMLShapeIR } from '../../ir/index.js';
import { parseShapePropertiesFromParent } from './shape-properties.js';
import { parseTextBodyFromParent } from './text-body.js';
import { parseStyleReference } from './style-reference.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a diagram drawing fallback (`dsp:drawing`) into slide elements.
 *
 * Extracts the `dsp:spTree` from the drawing root and parses each `dsp:sp`
 * child into a {@link DrawingMLShapeIR}. The shapes use the same DrawingML
 * sub-elements (`a:xfrm`, `a:solidFill`, `a:bodyPr`, etc.) as standard
 * shapes, so existing parsers handle the internals.
 *
 * @param drawingElement - The root `dsp:drawing` XML element.
 * @param theme - The resolved theme for color/style resolution.
 * @returns Array of parsed shapes from the fallback drawing.
 */
export function parseDiagramDrawing(drawingElement: XmlElement, theme: ThemeIR): SlideElementIR[] {
  const spTree = drawingElement.child('dsp:spTree');
  if (!spTree) {
    return [];
  }

  return parseDiagramShapeTree(spTree, theme);
}

/**
 * Parse a diagram shape tree (`dsp:spTree`) into slide elements.
 *
 * Iterates child elements and dispatches by tag name:
 * - `dsp:sp` → shape
 * - `dsp:grpSp` → group (recursive)
 * - Other tags are silently skipped (metadata, extensions).
 */
export function parseDiagramShapeTree(spTreeElement: XmlElement, theme: ThemeIR): SlideElementIR[] {
  const elements: SlideElementIR[] = [];

  // Tags that are structural metadata, not renderable shapes
  const skipTags = new Set(['dsp:nvGrpSpPr', 'dsp:grpSpPr', 'dsp:extLst']);

  for (const child of spTreeElement.children) {
    if (skipTags.has(child.name)) {
      continue;
    }

    if (child.is('dsp:sp')) {
      elements.push(parseDiagramShape(child, theme));
    }
    // dsp:grpSp could appear but is rare in SmartArt fallbacks;
    // silently skip unknown elements for forward compatibility.
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Internal: shape parsing
// ---------------------------------------------------------------------------

/**
 * Parse a diagram shape (`dsp:sp`) into a {@link DrawingMLShapeIR}.
 *
 * The `dsp:sp` element mirrors `p:sp`:
 * ```xml
 * <dsp:sp modelId="{GUID}">
 *   <dsp:nvSpPr>
 *     <dsp:cNvPr id="0" name=""/>
 *     <dsp:cNvSpPr/>
 *   </dsp:nvSpPr>
 *   <dsp:spPr>
 *     <a:xfrm>...</a:xfrm>
 *     <a:prstGeom prst="rect"/>
 *     <a:solidFill>...</a:solidFill>
 *     <a:ln>...</a:ln>
 *   </dsp:spPr>
 *   <dsp:style>
 *     <a:lnRef>...</a:lnRef>
 *     <a:fillRef>...</a:fillRef>
 *   </dsp:style>
 *   <dsp:txBody>
 *     <a:bodyPr>...</a:bodyPr>
 *     <a:p>...</a:p>
 *   </dsp:txBody>
 * </dsp:sp>
 * ```
 */
function parseDiagramShape(spElement: XmlElement, theme: ThemeIR): DrawingMLShapeIR {
  // parseShapePropertiesFromParent now checks dsp:spPr in addition to p:spPr/a:spPr
  const properties = parseShapePropertiesFromParent(spElement, theme);

  // parseTextBodyFromParent now checks dsp:txBody in addition to p:txBody/a:txBody
  const textBody = parseTextBodyFromParent(spElement, theme);

  // parseStyleReference now checks dsp:style in addition to p:style/a:style
  const style = parseStyleReference(spElement, theme);

  const shape: DrawingMLShapeIR = {
    kind: 'shape',
    properties,
  };

  if (style !== undefined) {
    shape.style = style;
  }

  if (textBody !== undefined) {
    shape.textBody = textBody;
  }

  // Extract non-visual properties
  const nvSpPr = spElement.child('dsp:nvSpPr');
  const cNvPr = nvSpPr?.child('dsp:cNvPr');

  const id = cNvPr?.attr('id');
  if (id !== undefined) {
    shape.id = id;
  }

  const name = cNvPr?.attr('name');
  if (name !== undefined && name !== '') {
    shape.name = name;
  }

  return shape;
}
