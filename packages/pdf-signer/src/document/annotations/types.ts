/**
 * Annotation constants from the PDF specification.
 */

// Annotation flags (PDF spec Table 165)
export const ANNOTATION_FLAG_INVISIBLE = 1 << 0;
export const ANNOTATION_FLAG_HIDDEN = 1 << 1;
export const ANNOTATION_FLAG_PRINT = 1 << 2;
export const ANNOTATION_FLAG_NO_ZOOM = 1 << 3;
export const ANNOTATION_FLAG_NO_ROTATE = 1 << 4;
export const ANNOTATION_FLAG_NO_VIEW = 1 << 5;
export const ANNOTATION_FLAG_READ_ONLY = 1 << 6;
export const ANNOTATION_FLAG_LOCKED = 1 << 7;
export const ANNOTATION_FLAG_TOGGLE_NO_VIEW = 1 << 8;
export const ANNOTATION_FLAG_LOCKED_CONTENTS = 1 << 9;

// Rubber stamp annotation names (PDF spec Table 176)
export enum StampName {
  APPROVED = 'Approved',
  EXPERIMENTAL = 'Experimental',
  NOT_APPROVED = 'NotApproved',
  AS_IS = 'AsIs',
  EXPIRED = 'Expired',
  NOT_FOR_PUBLIC_RELEASE = 'NotForPublicRelease',
  CONFIDENTIAL = 'Confidential',
  FINAL = 'Final',
  SOLD = 'Sold',
  DEPARTMENTAL = 'Departmental',
  FOR_COMMENT = 'ForComment',
  TOP_SECRET = 'TopSecret',
  DRAFT = 'Draft',
  FOR_PUBLIC_RELEASE = 'ForPublicRelease',
}

// Text annotation icon names (PDF spec Table 172)
export enum TextIconName {
  COMMENT = 'Comment',
  KEY = 'Key',
  NOTE = 'Note',
  HELP = 'Help',
  NEW_PARAGRAPH = 'NewParagraph',
  PARAGRAPH = 'Paragraph',
  INSERT = 'Insert',
}

// Line ending styles (PDF spec Table 176)
export enum LineEndingStyle {
  NONE = 'None',
  SQUARE = 'Square',
  CIRCLE = 'Circle',
  DIAMOND = 'Diamond',
  OPEN_ARROW = 'OpenArrow',
  CLOSED_ARROW = 'ClosedArrow',
  BUTT = 'Butt',
  R_OPEN_ARROW = 'ROpenArrow',
  R_CLOSED_ARROW = 'RClosedArrow',
  SLASH = 'Slash',
}

// Free text alignment (matches /Q values)
export enum FreeTextAlignment {
  LEFT = 0,
  CENTER = 1,
  RIGHT = 2,
}
