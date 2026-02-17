/**
 * Effect parser for DrawingML effect list elements.
 *
 * Parses the 5 effect types from `<a:effectLst>` into {@link EffectIR}
 * discriminated union values: outerShadow, innerShadow, glow, reflection,
 * and softEdge.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.8.25 (CT_EffectList)
 */

import type { XmlElement } from '../../xml/index.js';
import type { ThemeIR, EffectIR } from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { resolveColorFromParent } from '../../theme/index.js';
import { parseIntAttr, parseAngle } from '../../xml/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an effect list element (`<a:effectLst>`).
 *
 * Returns an array of parsed effects, empty if the element has no
 * recognized effect children.
 */
export function parseEffectList(
  effectLstElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): EffectIR[] {
  const effects: EffectIR[] = [];

  // Outer shadow
  const outerShdw = effectLstElement.child('a:outerShdw');
  if (outerShdw) {
    effects.push(parseOuterShadow(outerShdw, theme, context));
  }

  // Inner shadow
  const innerShdw = effectLstElement.child('a:innerShdw');
  if (innerShdw) {
    effects.push(parseInnerShadow(innerShdw, theme, context));
  }

  // Glow
  const glow = effectLstElement.child('a:glow');
  if (glow) {
    effects.push(parseGlow(glow, theme, context));
  }

  // Reflection
  const reflection = effectLstElement.child('a:reflection');
  if (reflection) {
    effects.push(parseReflection(reflection));
  }

  // Soft edge
  const softEdge = effectLstElement.child('a:softEdge');
  if (softEdge) {
    effects.push(parseSoftEdge(softEdge));
  }

  return effects;
}

/**
 * Parse effects from a parent element (looks for `<a:effectLst>` child).
 *
 * Returns an empty array if the parent has no `<a:effectLst>` child.
 */
export function parseEffectsFromParent(
  parentElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): EffectIR[] {
  const effectLst = parentElement.child('a:effectLst');
  if (!effectLst) {
    return [];
  }
  return parseEffectList(effectLst, theme, context);
}

// ---------------------------------------------------------------------------
// Outer shadow
// ---------------------------------------------------------------------------

/**
 * Parse an `<a:outerShdw>` element.
 *
 * ```xml
 * <a:outerShdw blurRad="50800" dist="38100" dir="5400000" algn="tl" rotWithShape="0">
 *   <a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr>
 * </a:outerShdw>
 * ```
 */
function parseOuterShadow(
  el: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): EffectIR {
  const blurRadius = parseIntAttr(el, 'blurRad') ?? 0;
  const distance = parseIntAttr(el, 'dist') ?? 0;
  const direction = parseAngle(el, 'dir') ?? 0;
  const alignment = el.attr('algn');
  const color = resolveColorFromParent(el, theme, context) ?? {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  };

  return {
    type: 'outerShadow',
    blurRadius,
    distance,
    direction,
    color,
    alignment,
  };
}

// ---------------------------------------------------------------------------
// Inner shadow
// ---------------------------------------------------------------------------

/**
 * Parse an `<a:innerShdw>` element.
 *
 * ```xml
 * <a:innerShdw blurRad="63500" dist="50800" dir="2700000">
 *   <a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr>
 * </a:innerShdw>
 * ```
 */
function parseInnerShadow(
  el: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): EffectIR {
  const blurRadius = parseIntAttr(el, 'blurRad') ?? 0;
  const distance = parseIntAttr(el, 'dist') ?? 0;
  const direction = parseAngle(el, 'dir') ?? 0;
  const color = resolveColorFromParent(el, theme, context) ?? {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  };

  return {
    type: 'innerShadow',
    blurRadius,
    distance,
    direction,
    color,
  };
}

// ---------------------------------------------------------------------------
// Glow
// ---------------------------------------------------------------------------

/**
 * Parse a `<a:glow>` element.
 *
 * ```xml
 * <a:glow rad="63500">
 *   <a:schemeClr val="accent1"><a:alpha val="40000"/></a:schemeClr>
 * </a:glow>
 * ```
 */
function parseGlow(
  el: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): EffectIR {
  const radius = parseIntAttr(el, 'rad') ?? 0;
  const color = resolveColorFromParent(el, theme, context) ?? {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  };

  return {
    type: 'glow',
    radius,
    color,
  };
}

// ---------------------------------------------------------------------------
// Reflection
// ---------------------------------------------------------------------------

/**
 * Parse a `<a:reflection>` element.
 *
 * Opacity values (`stA`, `endA`) are in 1/1000ths of a percent
 * (0-100000 -> 0-1).
 *
 * ```xml
 * <a:reflection blurRad="6350" stA="50000" endA="300"
 *               endPos="55000" dist="50800" dir="5400000"
 *               fadeDir="5400000"/>
 * ```
 */
function parseReflection(el: XmlElement): EffectIR {
  const blurRadius = parseIntAttr(el, 'blurRad') ?? 0;
  const stA = parseIntAttr(el, 'stA') ?? 100_000;
  const endA = parseIntAttr(el, 'endA') ?? 0;
  const distance = parseIntAttr(el, 'dist') ?? 0;
  const direction = parseAngle(el, 'dir') ?? 0;
  const fadeDirection = parseAngle(el, 'fadeDir') ?? 0;

  return {
    type: 'reflection',
    blurRadius,
    startOpacity: stA / 100_000,
    endOpacity: endA / 100_000,
    distance,
    direction,
    fadeDirection,
  };
}

// ---------------------------------------------------------------------------
// Soft edge
// ---------------------------------------------------------------------------

/**
 * Parse a `<a:softEdge>` element.
 *
 * ```xml
 * <a:softEdge rad="63500"/>
 * ```
 */
function parseSoftEdge(el: XmlElement): EffectIR {
  const radius = parseIntAttr(el, 'rad') ?? 0;

  return {
    type: 'softEdge',
    radius,
  };
}
