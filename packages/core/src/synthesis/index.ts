/**
 * OOXML XML synthesis — generate DrawingML/PresentationML from PageElement.
 *
 * @module synthesis
 */

export {
  // Main synthesis functions
  synthesizeShape,
  synthesizeSlideShape,
  synthesizeSlidePicture,
  synthesizeSlideGroup,
  synthesizeTransform,
  synthesizeFill,
  synthesizeLine,
  synthesizeTextBody,
  // Unit conversion helpers
  ptToEmu,
  degToOoxml,
  fontSizeToOoxml,
  colorToHex,
} from './element-to-ooxml.js';
