/**
 * pdfbox-ts/annotations — PDF annotation types.
 *
 * Standalone entrypoint for creating PDF annotations.
 */

export {
  PDAnnotation,
  PDAnnotationHighlight,
  PDAnnotationUnderline,
  PDAnnotationStrikeout,
  PDAnnotationSquiggly,
  PDAnnotationText,
  PDAnnotationFreeText,
  PDAnnotationRubberStamp,
  PDAnnotationLine,
  PDAnnotationSquare,
  PDAnnotationCircle,
  PDAnnotationInk,
  PDAnnotationLink,
  PDAnnotationRedact,
  ANNOTATION_FLAG_INVISIBLE,
  ANNOTATION_FLAG_HIDDEN,
  ANNOTATION_FLAG_PRINT,
  ANNOTATION_FLAG_NO_ZOOM,
  ANNOTATION_FLAG_NO_ROTATE,
  ANNOTATION_FLAG_NO_VIEW,
  ANNOTATION_FLAG_READ_ONLY,
  ANNOTATION_FLAG_LOCKED,
  ANNOTATION_FLAG_TOGGLE_NO_VIEW,
  ANNOTATION_FLAG_LOCKED_CONTENTS,
  StampName,
  TextIconName,
  LineEndingStyle,
  FreeTextAlignment,
} from './document/annotations/index.js';

export type {
  AnnotationOptions,
  HighlightOptions,
  UnderlineOptions,
  StrikeoutOptions,
  SquigglyOptions,
  TextAnnotationOptions,
  FreeTextOptions,
  StampOptions,
  LineOptions,
  SquareAnnotationOptions,
  CircleAnnotationOptions,
  InkOptions,
  LinkOptions,
  RedactAnnotationOptions,
} from './document/annotations/index.js';
