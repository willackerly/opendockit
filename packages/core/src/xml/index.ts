/**
 * XML Parser Wrapper — barrel export.
 *
 * Re-exports the full public API of the xml module:
 * - {@link parseXml} and {@link XmlElement} from `fast-parser`
 * - Namespace constants and maps from `namespace-map`
 * - Attribute parsing helpers from `attribute-helpers`
 */

export { parseXml } from './fast-parser.js';
export type { XmlElement } from './fast-parser.js';

export {
  // DrawingML
  NS_A,
  NS_C,
  NS_DGM,
  NS_PIC,
  NS_XDR,
  NS_PD,
  NS_WP,
  // Format-specific
  NS_P,
  NS_W,
  // Relationships
  NS_R,
  // OPC
  NS_CONTENT_TYPES,
  NS_RELATIONSHIPS,
  NS_CP,
  // Markup Compatibility
  NS_MC,
  // Microsoft extensions
  NS_A14,
  NS_A16,
  NS_P14,
  NS_WPS,
  NS_WPC,
  NS_WPG,
  NS_MO,
  // Office Document
  NS_EP,
  NS_M,
  // Dublin Core
  NS_DC,
  NS_DCTERMS,
  NS_DCMITYPE,
  // VML / legacy
  NS_V,
  NS_O,
  // Other
  NS_XSI,
  // Maps
  NAMESPACE_MAP,
  PREFIX_MAP,
} from './namespace-map.js';

export {
  parseBoolAttr,
  parseIntAttr,
  parseFloatAttr,
  parseOptionalInt,
  parseEnumAttr,
  parsePercentage,
  parseAngle,
  parseCoordinate,
} from './attribute-helpers.js';
