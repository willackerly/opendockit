/**
 * FontFlags — compute PDF font descriptor /Flags bitmask.
 *
 * PDF Reference Table 123 — Font descriptor flags:
 *   Bit 1 (0x01):  FixedPitch
 *   Bit 2 (0x02):  Serif
 *   Bit 3 (0x04):  Symbolic
 *   Bit 4 (0x08):  Script
 *   Bit 6 (0x20):  Nonsymbolic
 *   Bit 7 (0x40):  Italic
 */

import type { TrueTypeFontInfo } from './TrueTypeParser.js';

/** PDF Font Descriptor flag bits */
const FIXED_PITCH  = 1 << 0;  // Bit 1
const SERIF        = 1 << 1;  // Bit 2
const NONSYMBOLIC  = 1 << 5;  // Bit 6
const ITALIC       = 1 << 6;  // Bit 7

/**
 * Compute PDF font descriptor flags from parsed TrueType info.
 */
export function computeFontFlags(
  info: TrueTypeFontInfo & { _isItalic?: boolean; _isSerif?: boolean },
): number {
  let flags = 0;

  if (info.isFixedPitch) flags |= FIXED_PITCH;

  // Serif detection from OS/2 sFamilyClass (stored in _isSerif)
  if (info._isSerif) flags |= SERIF;

  // Nonsymbolic — set for all Latin text fonts
  flags |= NONSYMBOLIC;

  // Italic detection from OS/2 fsSelection or head macStyle (stored in _isItalic)
  if (info._isItalic) flags |= ITALIC;

  return flags;
}
