/**
 * Barrel exports for the flat edit model.
 *
 * Usage:
 *   import { EditablePresentation, EditTracker, makeElementId } from '@opendockit/core/edit';
 */

export { EditTracker } from './edit-tracker.js';
export {
  makeElementId,
  getPartFromElementId,
  getShapeIdFromElementId,
} from './element-id.js';
export type {
  DirtyFlags,
  EditableTransform,
  EditableParagraph,
  EditableTextRun,
  EditableTextBody,
  EditableElementBase,
  EditableShape,
  EditablePicture,
  EditableGroup,
  EditableConnector,
  EditableTable,
  EditableGeneric,
  EditableElement,
} from './editable-types.js';
export { EditablePresentation } from './editable-presentation.js';
export type { EditableSlide } from './editable-presentation.js';

// Reconstitution engine (XML patching for save)
export {
  parseXmlDom,
  serializeXmlDom,
  findShapeById,
  findTransformElement,
  findTextBodyElement,
  patchTransform,
  patchTextBody,
  removeShapeFromSlide,
  patchSlideIdList,
  patchElementXml,
  patchPartXml,
} from './reconstitution/index.js';
