export {
  parseXmlDom,
  serializeXmlDom,
  findShapeById,
  findTransformElement,
  findTextBodyElement,
} from './dom-utils.js';
export { patchTransform } from './transform-patcher.js';
export { patchTextBody } from './text-patcher.js';
export { removeShapeFromSlide } from './slide-patcher.js';
export { patchSlideIdList } from './presentation-patcher.js';
export { patchElementXml, patchPartXml } from './xml-patcher.js';
