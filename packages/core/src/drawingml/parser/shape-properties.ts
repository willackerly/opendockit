/**
 * Shape properties parser — composition layer.
 *
 * Orchestrates individual parsers (fill, line, effect, transform) and
 * parses geometry (preset or custom) to build {@link ShapePropertiesIR}.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.7.6 (CT_ShapeProperties)
 */

import type { XmlElement } from '../../xml/index.js';
import type {
  ThemeIR,
  ShapePropertiesIR,
  PresetGeometryIR,
  CustomGeometryIR,
  GeometryIR,
  ShapeGuideIR,
  ShapePathIR,
  PathCommandIR,
  ConnectionSiteIR,
} from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { parseIntAttr, parseAngle } from '../../xml/index.js';
import { parseFill } from './fill.js';
import { parseLineFromParent } from './line.js';
import { parseEffectsFromParent } from './effect.js';
import { parseTransformFromParent } from './transform.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse shape properties from an `a:spPr` element.
 *
 * Orchestrates fill, line, effect, transform, and geometry parsers.
 */
export function parseShapeProperties(
  spPrElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): ShapePropertiesIR {
  const transform = parseTransformFromParent(spPrElement);
  const fill = parseFill(spPrElement, theme, context);
  const line = parseLineFromParent(spPrElement, theme, context);
  const effects = parseEffectsFromParent(spPrElement, theme, context);
  const geometry = parseGeometry(spPrElement);

  const result: ShapePropertiesIR = { effects };

  if (transform !== undefined) {
    result.transform = transform;
  }
  if (fill !== undefined) {
    result.fill = fill;
  }
  if (line !== undefined) {
    result.line = line;
  }
  if (geometry !== undefined) {
    result.geometry = geometry;
  }

  return result;
}

/**
 * Parse shape properties from a parent element containing `a:spPr` or `p:spPr`.
 *
 * Returns a default (empty) {@link ShapePropertiesIR} if no spPr child is found.
 */
export function parseShapePropertiesFromParent(
  parentElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): ShapePropertiesIR {
  const spPr = parentElement.child('p:spPr') ?? parentElement.child('a:spPr');
  if (!spPr) {
    return { effects: [] };
  }
  return parseShapeProperties(spPr, theme, context);
}

// ---------------------------------------------------------------------------
// Geometry parsing
// ---------------------------------------------------------------------------

/**
 * Parse geometry from an spPr element.
 *
 * Looks for `a:prstGeom` (preset) or `a:custGeom` (custom) child.
 * Returns `undefined` if neither is present.
 */
function parseGeometry(spPrElement: XmlElement): GeometryIR | undefined {
  const prstGeomEl = spPrElement.child('a:prstGeom');
  if (prstGeomEl) {
    return parsePresetGeometry(prstGeomEl);
  }

  const custGeomEl = spPrElement.child('a:custGeom');
  if (custGeomEl) {
    return parseCustomGeometry(custGeomEl);
  }

  return undefined;
}

/**
 * Parse a preset geometry from `<a:prstGeom>`.
 *
 * ```xml
 * <a:prstGeom prst="roundRect">
 *   <a:avLst>
 *     <a:gd name="adj" fmla="val 16667"/>
 *   </a:avLst>
 * </a:prstGeom>
 * ```
 */
function parsePresetGeometry(prstGeomEl: XmlElement): PresetGeometryIR {
  const name = prstGeomEl.attr('prst') ?? 'rect';

  const avLst = prstGeomEl.child('a:avLst');
  let adjustValues: Record<string, number> | undefined;

  if (avLst) {
    const guides = avLst.allChildren('a:gd');
    if (guides.length > 0) {
      adjustValues = {};
      for (const gd of guides) {
        const gdName = gd.attr('name');
        const fmla = gd.attr('fmla');
        if (gdName && fmla) {
          const match = fmla.match(/^val\s+(-?\d+)$/);
          if (match) {
            adjustValues[gdName] = parseInt(match[1], 10);
          }
        }
      }
      if (Object.keys(adjustValues).length === 0) {
        adjustValues = undefined;
      }
    }
  }

  return {
    kind: 'preset',
    name,
    adjustValues,
  };
}

/**
 * Parse a custom geometry from `<a:custGeom>`.
 *
 * ```xml
 * <a:custGeom>
 *   <a:avLst>
 *     <a:gd name="adj1" fmla="val 50000"/>
 *   </a:avLst>
 *   <a:gdLst>
 *     <a:gd name="x1" fmla="star-slash w 1 2"/>
 *   </a:gdLst>
 *   <a:pathLst>
 *     <a:path w="100" h="100">
 *       <a:moveTo><a:pt x="0" y="0"/></a:moveTo>
 *       <a:lnTo><a:pt x="100" y="0"/></a:lnTo>
 *       <a:close/>
 *     </a:path>
 *   </a:pathLst>
 *   <a:cxnLst>
 *     <a:cxn ang="0"><a:pos x="r" y="vc"/></a:cxn>
 *   </a:cxnLst>
 * </a:custGeom>
 * ```
 */
function parseCustomGeometry(custGeomEl: XmlElement): CustomGeometryIR {
  // Parse adjust value list
  const guides: ShapeGuideIR[] = [];

  const avLst = custGeomEl.child('a:avLst');
  if (avLst) {
    for (const gd of avLst.allChildren('a:gd')) {
      const name = gd.attr('name');
      const fmla = gd.attr('fmla');
      if (name && fmla) {
        guides.push({ name, formula: fmla });
      }
    }
  }

  // Parse guide list
  const gdLst = custGeomEl.child('a:gdLst');
  if (gdLst) {
    for (const gd of gdLst.allChildren('a:gd')) {
      const name = gd.attr('name');
      const fmla = gd.attr('fmla');
      if (name && fmla) {
        guides.push({ name, formula: fmla });
      }
    }
  }

  // Parse path list
  const paths: ShapePathIR[] = [];
  const pathLst = custGeomEl.child('a:pathLst');
  if (pathLst) {
    for (const pathEl of pathLst.allChildren('a:path')) {
      paths.push(parseCustomPath(pathEl));
    }
  }

  // Parse connection sites
  let connectionSites: ConnectionSiteIR[] | undefined;
  const cxnLst = custGeomEl.child('a:cxnLst');
  if (cxnLst) {
    const sites: ConnectionSiteIR[] = [];
    for (const cxn of cxnLst.allChildren('a:cxn')) {
      const angVal = parseAngle(cxn, 'ang') ?? 0;
      const posEl = cxn.child('a:pos');
      const posX = posEl?.attr('x') ?? '0';
      const posY = posEl?.attr('y') ?? '0';
      sites.push({ angle: angVal, posX, posY });
    }
    if (sites.length > 0) {
      connectionSites = sites;
    }
  }

  const result: CustomGeometryIR = {
    kind: 'custom',
    guides,
    paths,
  };

  if (connectionSites) {
    result.connectionSites = connectionSites;
  }

  return result;
}

/**
 * Parse a single `<a:path>` element within a custom geometry pathLst.
 */
function parseCustomPath(pathEl: XmlElement): ShapePathIR {
  const w = parseIntAttr(pathEl, 'w');
  const h = parseIntAttr(pathEl, 'h');
  const fillAttr = pathEl.attr('fill');
  const strokeAttr = pathEl.attr('stroke');

  const commands: PathCommandIR[] = [];

  for (const child of pathEl.children) {
    if (child.is('a:moveTo')) {
      const pt = child.child('a:pt');
      if (pt) {
        commands.push({
          kind: 'moveTo',
          x: parseIntAttr(pt, 'x') ?? 0,
          y: parseIntAttr(pt, 'y') ?? 0,
        });
      }
    } else if (child.is('a:lnTo')) {
      const pt = child.child('a:pt');
      if (pt) {
        commands.push({
          kind: 'lineTo',
          x: parseIntAttr(pt, 'x') ?? 0,
          y: parseIntAttr(pt, 'y') ?? 0,
        });
      }
    } else if (child.is('a:cubicBezTo')) {
      const pts = child.allChildren('a:pt');
      if (pts.length >= 3) {
        commands.push({
          kind: 'cubicBezierTo',
          x1: parseIntAttr(pts[0], 'x') ?? 0,
          y1: parseIntAttr(pts[0], 'y') ?? 0,
          x2: parseIntAttr(pts[1], 'x') ?? 0,
          y2: parseIntAttr(pts[1], 'y') ?? 0,
          x: parseIntAttr(pts[2], 'x') ?? 0,
          y: parseIntAttr(pts[2], 'y') ?? 0,
        });
      }
    } else if (child.is('a:quadBezTo')) {
      const pts = child.allChildren('a:pt');
      if (pts.length >= 2) {
        commands.push({
          kind: 'quadBezierTo',
          x1: parseIntAttr(pts[0], 'x') ?? 0,
          y1: parseIntAttr(pts[0], 'y') ?? 0,
          x: parseIntAttr(pts[1], 'x') ?? 0,
          y: parseIntAttr(pts[1], 'y') ?? 0,
        });
      }
    } else if (child.is('a:arcTo')) {
      const wR = parseIntAttr(child, 'wR') ?? 0;
      const hR = parseIntAttr(child, 'hR') ?? 0;
      const stAng = parseAngle(child, 'stAng') ?? 0;
      const swAng = parseAngle(child, 'swAng') ?? 0;
      commands.push({
        kind: 'arcTo',
        wR,
        hR,
        startAngle: stAng,
        sweepAngle: swAng,
      });
    } else if (child.is('a:close')) {
      commands.push({ kind: 'close' });
    }
  }

  const shapePath: ShapePathIR = { commands };

  if (w !== undefined) {
    shapePath.width = w;
  }
  if (h !== undefined) {
    shapePath.height = h;
  }
  if (fillAttr !== undefined) {
    const validFills = ['norm', 'none', 'lighten', 'lightenLess', 'darken', 'darkenLess'];
    if (validFills.includes(fillAttr)) {
      shapePath.fill = fillAttr as ShapePathIR['fill'];
    }
  }
  if (strokeAttr !== undefined) {
    shapePath.stroke = strokeAttr !== '0' && strokeAttr !== 'false';
  }

  return shapePath;
}
