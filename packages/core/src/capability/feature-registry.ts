/**
 * OOXML Feature Coverage Registry.
 *
 * Machine-readable mapping of OOXML element XPaths to implementation status.
 * Used for automated coverage reporting and gap identification.
 *
 * Status meanings:
 * - full: Fully parsed and rendered with high fidelity.
 * - partial: Parsed and rendered but with known limitations.
 * - stub: Parsed into IR but not rendered (silently skipped or placeholder).
 * - not-implemented: Neither parsed nor rendered.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeatureStatus = 'full' | 'partial' | 'stub' | 'not-implemented';

export interface FeatureEntry {
  /** OOXML XPath pattern (e.g., "a:spPr/a:xfrm"). */
  xpath: string;
  /** Implementation status. */
  status: FeatureStatus;
  /** Which module handles parsing (e.g., "transform.ts"). */
  parser?: string;
  /** Which module handles rendering (e.g., "shape-renderer.ts"). */
  renderer?: string;
  /** Brief description of what this element does. */
  description: string;
  /** Known limitations or notes. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** The complete feature registry. */
export const FEATURE_REGISTRY: FeatureEntry[] = [
  // ── Transform ──────────────────────────────────────────────────────────
  {
    xpath: 'a:xfrm',
    status: 'full',
    parser: 'drawingml/parser/transform.ts',
    renderer: 'drawingml/renderer/shape-renderer.ts',
    description: 'Shape position, size, rotation, flip',
  },
  {
    xpath: 'a:xfrm/@rot',
    status: 'full',
    parser: 'drawingml/parser/transform.ts',
    description: 'Shape rotation in 60,000ths of a degree',
  },
  {
    xpath: 'a:xfrm/@flipH',
    status: 'full',
    parser: 'drawingml/parser/transform.ts',
    description: 'Horizontal flip',
  },
  {
    xpath: 'a:xfrm/@flipV',
    status: 'full',
    parser: 'drawingml/parser/transform.ts',
    description: 'Vertical flip',
  },

  // ── Fill ────────────────────────────────────────────────────────────────
  {
    xpath: 'a:solidFill',
    status: 'full',
    parser: 'drawingml/parser/fill.ts',
    renderer: 'drawingml/renderer/fill-renderer.ts',
    description: 'Solid color fill',
  },
  {
    xpath: 'a:gradFill',
    status: 'full',
    parser: 'drawingml/parser/fill.ts',
    renderer: 'drawingml/renderer/fill-renderer.ts',
    description: 'Gradient fill (linear and radial)',
  },
  {
    xpath: 'a:pattFill',
    status: 'full',
    parser: 'drawingml/parser/fill.ts',
    renderer: 'drawingml/renderer/fill-renderer.ts',
    description: 'Pattern fill (48 preset patterns)',
  },
  {
    xpath: 'a:blipFill',
    status: 'full',
    parser: 'drawingml/parser/fill.ts',
    renderer: 'drawingml/renderer/fill-renderer.ts',
    description: 'Picture/image fill',
  },
  {
    xpath: 'a:noFill',
    status: 'full',
    parser: 'drawingml/parser/fill.ts',
    description: 'No fill',
  },

  // ── Line/Stroke ─────────────────────────────────────────────────────────
  {
    xpath: 'a:ln',
    status: 'full',
    parser: 'drawingml/parser/line.ts',
    renderer: 'drawingml/renderer/line-renderer.ts',
    description: 'Outline stroke (width, cap, join, fill)',
  },
  {
    xpath: 'a:ln/a:prstDash',
    status: 'full',
    parser: 'drawingml/parser/line.ts',
    description: 'Preset dash patterns',
  },
  {
    xpath: 'a:ln/a:headEnd',
    status: 'full',
    parser: 'drawingml/parser/line.ts',
    renderer: 'drawingml/renderer/line-renderer.ts',
    description: 'Line arrow head',
  },
  {
    xpath: 'a:ln/a:tailEnd',
    status: 'full',
    parser: 'drawingml/parser/line.ts',
    renderer: 'drawingml/renderer/line-renderer.ts',
    description: 'Line arrow tail',
  },

  // ── Effects ─────────────────────────────────────────────────────────────
  {
    xpath: 'a:effectLst/a:outerShdw',
    status: 'full',
    parser: 'drawingml/parser/effect.ts',
    renderer: 'drawingml/renderer/effect-renderer.ts',
    description: 'Outer (drop) shadow',
  },
  {
    xpath: 'a:effectLst/a:innerShdw',
    status: 'stub',
    parser: 'drawingml/parser/effect.ts',
    description: 'Inner shadow',
    notes: 'Parsed into IR but not rendered; Canvas2D has no native inner-shadow support',
  },
  {
    xpath: 'a:effectLst/a:glow',
    status: 'partial',
    parser: 'drawingml/parser/effect.ts',
    renderer: 'drawingml/renderer/effect-renderer.ts',
    description: 'Glow effect',
    notes: 'Approximated as zero-offset Canvas2D shadow; not pixel-accurate',
  },
  {
    xpath: 'a:effectLst/a:reflection',
    status: 'stub',
    parser: 'drawingml/parser/effect.ts',
    description: 'Reflection effect',
    notes: 'Parsed into IR but not rendered; requires offscreen compositing',
  },
  {
    xpath: 'a:effectLst/a:softEdge',
    status: 'stub',
    parser: 'drawingml/parser/effect.ts',
    description: 'Soft edge effect',
    notes: 'Parsed into IR but not rendered; requires per-pixel alpha manipulation',
  },
  {
    xpath: 'a:effectLst/a:blur',
    status: 'not-implemented',
    description: 'Blur effect',
  },

  // ── Text Body ───────────────────────────────────────────────────────────
  {
    xpath: 'a:txBody',
    status: 'full',
    parser: 'drawingml/parser/text-body.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Text body container',
  },
  {
    xpath: 'a:bodyPr',
    status: 'full',
    parser: 'drawingml/parser/text-body.ts',
    description: 'Text body properties (wrap, anchor, margins, autofit)',
  },
  {
    xpath: 'a:bodyPr/@vert',
    status: 'full',
    parser: 'drawingml/parser/text-body.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Vertical text direction (horz, vert, vert270, eaVert, wordArtVert)',
  },
  {
    xpath: 'a:bodyPr/@numCol',
    status: 'partial',
    parser: 'drawingml/parser/text-body.ts',
    description: 'Multi-column text',
    notes: 'Parsed into IR but layout does not split text across columns',
  },

  // ── Paragraph & Run ────────────────────────────────────────────────────
  {
    xpath: 'a:p',
    status: 'full',
    parser: 'drawingml/parser/paragraph.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Paragraph',
  },
  {
    xpath: 'a:r',
    status: 'full',
    parser: 'drawingml/parser/run.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Text run',
  },
  {
    xpath: 'a:rPr',
    status: 'full',
    parser: 'drawingml/parser/run.ts',
    description: 'Run properties (font, size, bold, italic, color, etc.)',
  },
  {
    xpath: 'a:rPr/a:effectLst',
    status: 'not-implemented',
    description: 'Text-level effects (shadow/glow on individual runs)',
  },
  {
    xpath: 'a:rPr/a:ln',
    status: 'full',
    parser: 'drawingml/parser/run.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Text outline stroke',
  },
  {
    xpath: 'a:rPr/@cap',
    status: 'full',
    parser: 'drawingml/parser/run.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Capitalization (all-caps, small-caps)',
  },
  {
    xpath: 'a:rPr/@u',
    status: 'full',
    parser: 'drawingml/parser/run.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Underline (16 OOXML styles)',
  },
  {
    xpath: 'a:rPr/@strike',
    status: 'full',
    parser: 'drawingml/parser/run.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Strikethrough and double strikethrough',
  },
  {
    xpath: 'a:pPr/@rtl',
    status: 'full',
    parser: 'drawingml/parser/paragraph.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Right-to-left paragraph direction',
  },
  {
    xpath: 'a:pPr/a:tabLst',
    status: 'full',
    parser: 'drawingml/parser/paragraph.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Custom tab stops',
  },
  {
    xpath: 'a:fld',
    status: 'full',
    parser: 'drawingml/parser/run.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Field codes (slide number, date/time)',
  },
  {
    xpath: 'a:endParaRPr',
    status: 'full',
    parser: 'drawingml/parser/paragraph.ts',
    description: 'End-of-paragraph run properties (empty paragraph font sizing)',
  },

  // ── Geometry ────────────────────────────────────────────────────────────
  {
    xpath: 'a:prstGeom',
    status: 'full',
    parser: 'drawingml/geometry/',
    renderer: 'drawingml/renderer/shape-renderer.ts',
    description: '187 preset geometry shapes',
  },
  {
    xpath: 'a:custGeom',
    status: 'full',
    parser: 'drawingml/geometry/',
    renderer: 'drawingml/renderer/shape-renderer.ts',
    description: 'Custom geometry paths (moveTo, lineTo, arcTo, cubicBezTo, close)',
  },

  // ── Pictures ────────────────────────────────────────────────────────────
  {
    xpath: 'p:pic',
    status: 'full',
    parser: 'drawingml/parser/picture.ts',
    renderer: 'drawingml/renderer/picture-renderer.ts',
    description: 'Picture/image element',
  },
  {
    xpath: 'a:blip',
    status: 'full',
    parser: 'drawingml/parser/picture.ts',
    description: 'Image binary reference (r:embed / r:link)',
  },
  {
    xpath: 'a:srcRect',
    status: 'full',
    parser: 'drawingml/parser/picture.ts',
    renderer: 'drawingml/renderer/picture-renderer.ts',
    description: 'Image crop rectangle',
  },

  // ── Groups ──────────────────────────────────────────────────────────────
  {
    xpath: 'p:grpSp',
    status: 'full',
    parser: 'drawingml/parser/group.ts',
    renderer: 'drawingml/renderer/group-renderer.ts',
    description: 'Group shape with recursive child rendering',
  },

  // ── Tables ──────────────────────────────────────────────────────────────
  {
    xpath: 'a:tbl',
    status: 'full',
    parser: 'drawingml/parser/table.ts',
    renderer: 'drawingml/renderer/table-renderer.ts',
    description: 'Table with merged cells, borders, and per-cell text bodies',
  },

  // ── Connectors ──────────────────────────────────────────────────────────
  {
    xpath: 'p:cxnSp',
    status: 'partial',
    parser: 'pptx/parser/shape-tree.ts',
    renderer: 'drawingml/renderer/connector-renderer.ts',
    description: 'Connector shapes (straight, bent, curved)',
    notes:
      'Renders line between bounding-box edges; does not use connection site indices from cxnSp/stCxn or endCxn',
  },

  // ── SmartArt ────────────────────────────────────────────────────────────
  {
    xpath: 'p:graphicFrame/dgm:drawing',
    status: 'partial',
    parser: 'pptx/parser/smartart-fallback.ts',
    description: 'SmartArt diagrams',
    notes: 'Uses fallback DrawingML shapes from dgm:relIds; no live diagram layout engine',
  },

  // ── Charts ──────────────────────────────────────────────────────────────
  {
    xpath: 'p:graphicFrame/c:chart',
    status: 'partial',
    parser: 'pptx/parser/chart-fallback.ts',
    description: 'Charts (ChartML)',
    notes: 'Renders cached image fallback only; no ChartML parsing or live chart rendering',
  },

  // ── Slide Structure ─────────────────────────────────────────────────────
  {
    xpath: 'p:sld',
    status: 'full',
    parser: 'pptx/parser/slide.ts',
    description: 'Slide parsing (shape tree, placeholder resolution)',
  },
  {
    xpath: 'p:sldMaster',
    status: 'full',
    parser: 'pptx/parser/slide-master.ts',
    description: 'Slide master (shapes, color map, theme reference)',
  },
  {
    xpath: 'p:sldLayout',
    status: 'full',
    parser: 'pptx/parser/slide-layout.ts',
    description: 'Slide layout (placeholder definitions, default styles)',
  },
  {
    xpath: 'p:bg',
    status: 'full',
    renderer: 'pptx/renderer/background-renderer.ts',
    description: 'Slide background (solid, gradient, pattern, image fills)',
  },
  {
    xpath: 'p:notes',
    status: 'full',
    parser: 'pptx/parser/slide.ts',
    description: 'Speaker notes (plain text extraction from notesSlide parts)',
  },

  // ── Hyperlinks ──────────────────────────────────────────────────────────
  {
    xpath: 'a:hlinkClick',
    status: 'full',
    parser: 'drawingml/parser/run.ts',
    description: 'Hyperlinks on runs and shapes (external URL, internal slide jump)',
  },

  // ── Theme ───────────────────────────────────────────────────────────────
  {
    xpath: 'a:theme',
    status: 'full',
    parser: 'ir/theme-ir.ts',
    description: 'Theme (colors, fonts, format schemes)',
  },
  {
    xpath: 'a:clrScheme',
    status: 'full',
    parser: 'ir/theme-ir.ts',
    description: 'Color scheme (12 semantic colors)',
  },
  {
    xpath: 'a:fontScheme',
    status: 'full',
    parser: 'ir/theme-ir.ts',
    description: 'Font scheme (major/minor typefaces)',
  },

  // ── Style References ────────────────────────────────────────────────────
  {
    xpath: 'a:style',
    status: 'full',
    parser: 'drawingml/parser/style-reference.ts',
    description: 'Shape style reference (lnRef, fillRef, effectRef, fontRef)',
  },

  // ── Markup Compatibility ────────────────────────────────────────────────
  {
    xpath: 'mc:AlternateContent',
    status: 'partial',
    description: 'Markup compatibility alternate content',
    notes: 'Falls back to mc:Fallback content; mc:Choice extensions are ignored',
  },

  // ── Not Implemented ─────────────────────────────────────────────────────
  {
    xpath: 'p:transition',
    status: 'not-implemented',
    description: 'Slide transitions',
  },
  {
    xpath: 'p:timing',
    status: 'not-implemented',
    description: 'Slide timing and animations',
  },
  {
    xpath: 'a:scene3d',
    status: 'not-implemented',
    description: '3D scene properties (camera, light rig)',
  },
  {
    xpath: 'a:sp3d',
    status: 'not-implemented',
    description: '3D shape properties (extrusion, bevel, material)',
  },
  {
    xpath: 'a:effectDag',
    status: 'not-implemented',
    description: 'Effect DAG (directed acyclic graph of chained effects)',
  },
  {
    xpath: 'p:oleObj',
    status: 'not-implemented',
    description: 'OLE embedded objects',
  },
  {
    xpath: 'a:rPr/@baseline',
    status: 'partial',
    parser: 'drawingml/parser/run.ts',
    renderer: 'drawingml/renderer/text-renderer.ts',
    description: 'Superscript/subscript baseline shift',
    notes: 'Parsed and rendered but vertical offset may not match PowerPoint exactly',
  },
];

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Get entries by status. */
export function getFeaturesByStatus(status: FeatureStatus): FeatureEntry[] {
  return FEATURE_REGISTRY.filter((e) => e.status === status);
}

/** Get coverage summary counts. */
export function getCoverageSummary(): {
  total: number;
  full: number;
  partial: number;
  stub: number;
  notImplemented: number;
} {
  const r = FEATURE_REGISTRY;
  return {
    total: r.length,
    full: r.filter((e) => e.status === 'full').length,
    partial: r.filter((e) => e.status === 'partial').length,
    stub: r.filter((e) => e.status === 'stub').length,
    notImplemented: r.filter((e) => e.status === 'not-implemented').length,
  };
}

/** Find a feature entry by exact XPath match. */
export function findFeature(xpathPattern: string): FeatureEntry | undefined {
  return FEATURE_REGISTRY.find((e) => e.xpath === xpathPattern);
}

/** Search features whose XPath contains the given substring. */
export function searchFeatures(substring: string): FeatureEntry[] {
  const lower = substring.toLowerCase();
  return FEATURE_REGISTRY.filter(
    (e) => e.xpath.toLowerCase().includes(lower) || e.description.toLowerCase().includes(lower)
  );
}
