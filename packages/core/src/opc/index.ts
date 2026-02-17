/**
 * OPC Package Reader — barrel export.
 *
 * Re-exports the full public API of the OPC module:
 * - {@link OpcPackageReader} and {@link OpcPackage} from `package-reader`
 * - {@link ContentTypeMap} and {@link parseContentTypes} from `content-types`
 * - {@link RelationshipMap}, {@link Relationship}, relationship constants,
 *   and {@link parseRelationships} from `relationship-resolver`
 * - Part URI utilities from `part-uri`
 */

export { OpcPackageReader } from './package-reader.js';
export type { OpcPackage, ProgressEvent } from './package-reader.js';

export { parseContentTypes } from './content-types.js';
export type { ContentTypeMap } from './content-types.js';

export {
  parseRelationships,
  REL_SLIDE,
  REL_SLIDE_LAYOUT,
  REL_SLIDE_MASTER,
  REL_THEME,
  REL_OFFICE_DOCUMENT,
  REL_IMAGE,
  REL_CHART,
  REL_NOTES_SLIDE,
  REL_HYPERLINK,
  REL_COMMENT_AUTHORS,
  REL_PRES_PROPS,
  REL_VIEW_PROPS,
  REL_TABLE_STYLES,
} from './relationship-resolver.js';
export type { Relationship, RelationshipMap } from './relationship-resolver.js';

export {
  normalizePartUri,
  resolvePartUri,
  getPartDirectory,
  getRelationshipPartUri,
  getRootRelationshipUri,
} from './part-uri.js';
