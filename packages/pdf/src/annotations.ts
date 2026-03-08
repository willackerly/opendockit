/**
 * @opendockit/pdf/annotations — PDF annotation types.
 *
 * Re-exports annotation types from @opendockit/pdf-signer/annotations.
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
} from '@opendockit/pdf-signer/annotations';

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
} from '@opendockit/pdf-signer/annotations';
