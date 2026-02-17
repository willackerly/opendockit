/**
 * Type-safe attribute parsing helpers for OOXML elements.
 *
 * OOXML attributes use a handful of "simple types" (ST_*) that encode
 * booleans, integers, percentages, angles, and coordinates as strings.
 * These helpers centralise the parsing logic so individual parsers
 * never need to deal with raw string→number conversion.
 *
 * Reference: ECMA-376, Part 1, Section 22.9 (Simple Types).
 */

import type { XmlElement } from './fast-parser.js';

// ---------------------------------------------------------------------------
// Booleans
// ---------------------------------------------------------------------------

/**
 * Parse a boolean attribute.
 *
 * OOXML booleans can be `'1'`, `'true'`, `'on'` (truthy) or
 * `'0'`, `'false'`, `'off'` (falsy).
 *
 * @returns The parsed boolean, or `defaultValue` (default `false`) when the
 *          attribute is absent.
 */
export function parseBoolAttr(
  el: XmlElement,
  name: string,
  defaultValue: boolean = false
): boolean {
  const raw = el.attr(name);
  if (raw === undefined) return defaultValue;

  const lower = raw.toLowerCase();
  if (lower === '1' || lower === 'true' || lower === 'on') return true;
  if (lower === '0' || lower === 'false' || lower === 'off') return false;

  return defaultValue;
}

// ---------------------------------------------------------------------------
// Integers / floats
// ---------------------------------------------------------------------------

/**
 * Parse an integer attribute.
 *
 * @returns The parsed integer, or `undefined` if the attribute is absent or
 *          not a valid integer.
 */
export function parseIntAttr(el: XmlElement, name: string): number | undefined {
  const raw = el.attr(name);
  if (raw === undefined) return undefined;

  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Parse a floating-point attribute.
 *
 * @returns The parsed float, or `undefined` if absent or not a valid number.
 */
export function parseFloatAttr(el: XmlElement, name: string): number | undefined {
  const raw = el.attr(name);
  if (raw === undefined) return undefined;

  const n = parseFloat(raw);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Parse an integer attribute with a fallback default.
 *
 * @returns The parsed integer, or `defaultValue` when absent/invalid.
 */
export function parseOptionalInt(el: XmlElement, name: string, defaultValue: number): number {
  const v = parseIntAttr(el, name);
  return v === undefined ? defaultValue : v;
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Parse an attribute whose value must be one of a fixed set of strings.
 *
 * @returns The value cast to `T`, or `undefined` if absent or not in the
 *          allowed set.
 */
export function parseEnumAttr<T extends string>(
  el: XmlElement,
  name: string,
  allowed: readonly T[]
): T | undefined {
  const raw = el.attr(name);
  if (raw === undefined) return undefined;

  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

// ---------------------------------------------------------------------------
// OOXML "simple type" conversions
// ---------------------------------------------------------------------------

/**
 * Parse an **ST_Percentage** attribute.
 *
 * OOXML stores percentages as thousandths of a percent:
 * `100000` = 100%, `50000` = 50%.
 *
 * @returns A normalised 0–1 float, or `undefined` if absent.
 */
export function parsePercentage(el: XmlElement, name: string): number | undefined {
  const raw = parseIntAttr(el, name);
  return raw === undefined ? undefined : raw / 100_000;
}

/**
 * Parse an **ST_Angle** attribute.
 *
 * OOXML stores angles in 60 000ths of a degree: `5400000` = 90 degrees.
 *
 * @returns Degrees as a float, or `undefined` if absent.
 */
export function parseAngle(el: XmlElement, name: string): number | undefined {
  const raw = parseIntAttr(el, name);
  return raw === undefined ? undefined : raw / 60_000;
}

/**
 * Parse an **ST_Coordinate** (EMU) attribute.
 *
 * EMU values are already plain integers so this is essentially
 * {@link parseIntAttr} with a domain-specific name.
 *
 * @returns EMU value as an integer, or `undefined` if absent.
 */
export function parseCoordinate(el: XmlElement, name: string): number | undefined {
  return parseIntAttr(el, name);
}
