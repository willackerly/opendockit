/**
 * SmartArt fallback resolver for PPTX slides.
 *
 * SmartArt diagrams in OOXML are complex (they have their own layout engine
 * in the `dgm:` namespace). However, PowerPoint also saves a **pre-rendered
 * fallback** as regular DrawingML shapes inside a `drawing*.xml` part. This
 * module resolves those fallbacks so we get SmartArt rendering "for free"
 * without building a diagram layout engine.
 *
 * ## OOXML Structure
 *
 * A SmartArt `p:graphicFrame` on a slide references diagram parts:
 * ```xml
 * <p:graphicFrame>
 *   <p:xfrm><a:off x="..." y="..."/><a:ext cx="..." cy="..."/></p:xfrm>
 *   <a:graphic>
 *     <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">
 *       <dgm:relIds r:dm="rId2" r:lo="rId3" r:qs="rId4" r:cs="rId5"/>
 *     </a:graphicData>
 *   </a:graphic>
 * </p:graphicFrame>
 * ```
 *
 * The slide's relationships include a `diagramDrawing` relationship pointing
 * to the pre-rendered fallback part (`drawing*.xml`), which contains standard
 * DrawingML shapes in the `dsp:` namespace.
 *
 * ## Resolution Flow
 *
 * 1. Scan the slide XML for diagram graphicFrames (those with the diagram URI)
 * 2. For each, follow the `diagramDrawing` relationship to find the drawing part
 * 3. Parse the `dsp:spTree` fallback shapes using existing parsers
 * 4. Wrap them in a `GroupIR` positioned at the graphicFrame's transform
 * 5. Replace the matching `UnsupportedIR` entry in the slide's elements array
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.4 (Diagrams)
 */

import type { XmlElement, ThemeIR, SlideElementIR, GroupIR, TransformIR } from '@opendockit/core';
import type { OpcPackage } from '@opendockit/core/opc';
import { REL_DIAGRAM_DRAWING } from '@opendockit/core/opc';
import { parseDiagramDrawing, parseTransform } from '@opendockit/core/drawingml';
import type { SlideIR } from '../model/index.js';

/** URI identifying a SmartArt diagram inside a graphic frame. */
const DIAGRAM_URI = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';

/** URI identifying a table inside a graphic frame (used to skip them). */
const TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table';

/**
 * Resolve SmartArt fallback drawings in a parsed slide.
 *
 * Scans the slide's elements for unsupported `p:graphicFrame` entries
 * (SmartArt), resolves their pre-rendered fallback from the OPC package,
 * and replaces them with rendered `GroupIR` shapes.
 *
 * This function mutates the `slide.elements` array in-place for efficiency.
 *
 * @param slide - The parsed slide IR (will be mutated).
 * @param slideXml - The raw slide XML element (for re-scanning graphicFrames).
 * @param pkg - The OPC package for reading diagram drawing parts.
 * @param slidePartUri - The OPC part URI of the slide.
 * @param theme - The resolved theme for shape parsing.
 */
export async function resolveSmartArtFallbacks(
  slide: SlideIR,
  slideXml: XmlElement,
  pkg: OpcPackage,
  slidePartUri: string,
  theme: ThemeIR
): Promise<void> {
  // Quick check: any unsupported graphicFrames?
  const hasUnsupported = slide.elements.some(
    (el) => el.kind === 'unsupported' && el.elementType === 'p:graphicFrame'
  );
  if (!hasUnsupported) {
    return;
  }

  // Get the graphicFrame XML elements from the slide (in document order)
  const cSld = slideXml.child('p:cSld');
  const spTree = cSld?.child('p:spTree');
  if (!spTree) return;

  const graphicFrameElements = spTree.children.filter((c) => c.is('p:graphicFrame'));
  if (graphicFrameElements.length === 0) return;

  // Classify each graphicFrame by its URI. We need this to match
  // unsupported entries (non-table graphicFrames) with the right XML elements.
  // Tables have already been replaced by shape-tree.ts; they are NOT in the
  // unsupported entries. So we build a list of non-table graphicFrame elements
  // and match them 1:1 with the unsupported p:graphicFrame entries.
  const nonTableFrames: XmlElement[] = [];
  for (const gfElement of graphicFrameElements) {
    const uri = getGraphicFrameUri(gfElement);
    if (uri !== TABLE_URI) {
      nonTableFrames.push(gfElement);
    }
  }

  if (nonTableFrames.length === 0) return;

  // Get slide relationships (for resolving diagram drawing parts)
  const slideRels = await pkg.getPartRelationships(slidePartUri);
  const drawingRels = slideRels.getByType(REL_DIAGRAM_DRAWING);

  // Build the match: unsupported p:graphicFrame entries in slide.elements
  // appear in the same order as non-table graphicFrame XML elements.
  let nonTableIdx = 0;
  let drawingRelIdx = 0;
  for (let i = 0; i < slide.elements.length; i++) {
    const el = slide.elements[i];
    if (el.kind !== 'unsupported' || el.elementType !== 'p:graphicFrame') {
      continue;
    }

    // Match this unsupported entry with the next non-table graphicFrame
    const gfElement = nonTableFrames[nonTableIdx++];
    if (!gfElement) break;

    // Only handle diagram graphicFrames
    const uri = getGraphicFrameUri(gfElement);
    if (uri !== DIAGRAM_URI) continue;

    // Get the next diagram drawing relationship
    if (drawingRelIdx >= drawingRels.length) continue;
    const drawingRel = drawingRels[drawingRelIdx++];

    // Extract transform from the graphicFrame
    const xfrmEl = gfElement.child('p:xfrm');
    const transform = xfrmEl ? parseTransform(xfrmEl) : undefined;

    // Try to load and parse the diagram drawing fallback
    const group = await loadDiagramDrawingAsGroup(pkg, drawingRel.target, theme, transform);

    if (group) {
      slide.elements[i] = group;
    }
  }
}

/**
 * Get the graphic data URI from a graphicFrame element.
 */
function getGraphicFrameUri(gfElement: XmlElement): string | undefined {
  const graphic = gfElement.child('a:graphic');
  const graphicData = graphic?.child('a:graphicData');
  return graphicData?.attr('uri');
}

/**
 * Load a diagram drawing part and parse it into a `GroupIR`.
 *
 * @param pkg - The OPC package.
 * @param drawingPartUri - URI of the diagram drawing part.
 * @param theme - The resolved theme.
 * @param transform - The graphicFrame transform to position the group.
 * @returns A GroupIR containing the fallback shapes, or undefined on failure.
 */
async function loadDiagramDrawingAsGroup(
  pkg: OpcPackage,
  drawingPartUri: string,
  theme: ThemeIR,
  transform?: TransformIR
): Promise<GroupIR | undefined> {
  let drawingXml: XmlElement;
  try {
    drawingXml = await pkg.getPartXml(drawingPartUri);
  } catch {
    // Drawing part missing or unparseable -- gracefully return undefined.
    return undefined;
  }

  // Parse the dsp:spTree fallback shapes
  const children = parseDiagramDrawing(drawingXml, theme);
  if (children.length === 0) {
    return undefined;
  }

  // Compute the child coordinate space from the shapes' bounding box.
  // The dsp:spTree shapes use their own coordinate space, and the
  // graphicFrame's p:xfrm maps that space to slide coordinates.
  const childBounds = computeChildBounds(children);

  return {
    kind: 'group',
    properties: {
      transform,
      effects: [],
    },
    childOffset: { x: childBounds.minX, y: childBounds.minY },
    childExtent: {
      width: childBounds.maxX - childBounds.minX,
      height: childBounds.maxY - childBounds.minY,
    },
    children,
  };
}

/**
 * Compute the bounding box of a set of slide elements.
 *
 * Used to determine the child coordinate space for the SmartArt group.
 */
function computeChildBounds(elements: SlideElementIR[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const transform = getElementTransform(el);
    if (!transform) continue;

    const x = transform.position.x;
    const y = transform.position.y;
    const right = x + transform.size.width;
    const bottom = y + transform.size.height;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }

  // Fallback if no transforms found
  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Extract the transform from a slide element (type-safe across all IR kinds).
 */
function getElementTransform(el: SlideElementIR): TransformIR | undefined {
  switch (el.kind) {
    case 'shape':
    case 'picture':
    case 'group':
    case 'connector':
    case 'table':
      return el.properties.transform;
    default:
      return undefined;
  }
}
