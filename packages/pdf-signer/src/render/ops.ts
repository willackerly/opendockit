/**
 * OPS — Integer constants for rendering operations.
 *
 * Mirrors PDF.js OPS enum so our OperatorList format is compatible.
 * Each constant maps to a method on CanvasGraphics.
 *
 * PDF operator → OPS constant → Canvas 2D API call
 */

export const OPS = {
  // Dependencies (internal)
  dependency: 1,

  // Graphics state
  setLineWidth: 2,      // w
  setLineCap: 3,         // J
  setLineJoin: 4,        // j
  setMiterLimit: 5,      // M
  setDash: 6,            // d
  setRenderingIntent: 7, // ri
  setFlatness: 8,        // i
  setGState: 9,          // gs (ExtGState)
  save: 10,              // q
  restore: 11,           // Q
  transform: 12,         // cm

  // Path construction
  moveTo: 13,            // m
  lineTo: 14,            // l
  curveTo: 15,           // c
  curveTo2: 16,          // v (first control point = current)
  curveTo3: 17,          // y (second control point = endpoint)
  closePath: 18,         // h
  rectangle: 19,         // re

  // Path painting
  stroke: 20,            // S
  closeStroke: 21,       // s
  fill: 22,              // f / F
  eoFill: 23,            // f*
  fillStroke: 24,        // B
  eoFillStroke: 25,      // B*
  closeFillStroke: 26,   // b
  closeEOFillStroke: 27, // b*
  endPath: 28,           // n
  clip: 29,              // W
  eoClip: 30,            // W*

  // Text
  beginText: 31,         // BT
  endText: 32,           // ET
  setCharSpacing: 33,    // Tc
  setWordSpacing: 34,    // Tw
  setHScale: 35,         // Tz
  setLeading: 36,        // TL
  setFont: 37,           // Tf
  setTextRenderingMode: 38, // Tr
  setTextRise: 39,       // Ts
  moveText: 40,          // Td
  setLeadingMoveText: 41, // TD
  setTextMatrix: 42,     // Tm
  nextLine: 43,          // T*
  showText: 44,          // Tj
  showSpacedText: 45,    // TJ
  nextLineShowText: 46,  // '
  nextLineSetSpacingShowText: 47, // "
  setCharWidth: 48,      // d0
  setCharWidthAndBounds: 49, // d1

  // Color
  setStrokeColorSpace: 50, // CS
  setFillColorSpace: 51,   // cs
  setStrokeColor: 52,      // SC / SCN
  setStrokeColorN: 53,     // SCN (with name)
  setFillColor: 54,        // sc / scn
  setFillColorN: 55,       // scn (with name)
  setStrokeGray: 56,       // G
  setFillGray: 57,         // g
  setStrokeRGBColor: 58,   // RG
  setFillRGBColor: 59,     // rg
  setStrokeCMYKColor: 60,  // K
  setFillCMYKColor: 61,    // k

  // Shading
  shadingFill: 62,         // sh

  // Inline images
  beginInlineImage: 63,    // BI
  beginImageData: 64,      // ID
  endInlineImage: 65,      // EI

  // XObjects
  paintXObject: 66,        // Do

  // Marked content
  markPoint: 67,           // MP
  markPointProps: 68,      // DP
  beginMarkedContent: 69,  // BMC
  beginMarkedContentProps: 70, // BDC
  endMarkedContent: 71,    // EMC

  // Compatibility
  beginCompat: 72,         // BX
  endCompat: 73,           // EX

  // Form XObjects (emitted by evaluator, not from content stream)
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,

  // Transparency groups
  beginGroup: 76,
  endGroup: 77,

  // Annotations (emitted by evaluator)
  beginAnnotation: 80,
  endAnnotation: 81,

  // Optimized image operations (emitted by evaluator)
  paintImageMaskXObject: 83,
  paintImageMaskXObjectGroup: 84,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintInlineImageXObjectGroup: 87,
  paintImageXObjectRepeat: 88,
  paintImageMaskXObjectRepeat: 89,
  paintSolidColorImageMask: 90,

  // Optimized path operations
  constructPath: 91,

  // Transparency helpers
  setStrokeTransparent: 92,
  setFillTransparent: 93,
} as const;

export type OPSCode = (typeof OPS)[keyof typeof OPS];
