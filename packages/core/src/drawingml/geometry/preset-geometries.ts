/**
 * Preset Geometry Definitions.
 *
 * Data definitions for OOXML preset shapes, translated from Apache POI's
 * presetShapeDefinitions.xml. Each shape defines:
 * - avLst: default adjust values (overridable by the document)
 * - gdLst: guide formulas that compute coordinates from adjust values
 * - pathLst: path commands that reference guide results and built-ins
 * - cxnLst: connection sites for connectors (optional)
 * - rect: text rectangle within the shape (optional)
 *
 * This file is pure data — no logic, no side effects.
 *
 * Reference: ECMA-376 5th Edition, Part 1, 20.1.9.15 (prstGeom)
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PresetGeometryDef {
  name: string;
  avLst: Array<{ name: string; fmla: string }>; // default adjust values
  gdLst: Array<{ name: string; fmla: string }>; // guide formulas
  pathLst: PresetPath[];
  cxnLst?: Array<{ x: string; y: string; ang: string }>;
  rect?: { l: string; t: string; r: string; b: string };
}

export interface PresetPath {
  w?: number;
  h?: number;
  fill?: 'norm' | 'none' | 'lighten' | 'lightenLess' | 'darken' | 'darkenLess';
  stroke?: boolean;
  commands: PresetPathCommand[];
}

export type PresetPathCommand =
  | { type: 'moveTo'; x: string; y: string }
  | { type: 'lnTo'; x: string; y: string }
  | { type: 'arcTo'; wR: string; hR: string; stAng: string; swAng: string }
  | { type: 'cubicBezTo'; pts: Array<{ x: string; y: string }> }
  | { type: 'quadBezTo'; pts: Array<{ x: string; y: string }> }
  | { type: 'close' };

// ═══════════════════════════════════════════════════════════════════════════
// Preset Shape Definitions
// ═══════════════════════════════════════════════════════════════════════════

const PRESETS: Map<string, PresetGeometryDef> = new Map();

function def(shape: PresetGeometryDef): void {
  PRESETS.set(shape.name, shape);
}

// ---------------------------------------------------------------------------
// rect
// ---------------------------------------------------------------------------
def({
  name: 'rect',
  avLst: [],
  gdLst: [],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 't' },
        { type: 'lnTo', x: 'r', y: 't' },
        { type: 'lnTo', x: 'r', y: 'b' },
        { type: 'lnTo', x: 'l', y: 'b' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'l', t: 't', r: 'r', b: 'b' },
});

// ---------------------------------------------------------------------------
// roundRect
// ---------------------------------------------------------------------------
def({
  name: 'roundRect',
  avLst: [{ name: 'adj', fmla: 'val 16667' }],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 50000' },
    { name: 'x1', fmla: '*/ ss a 100000' },
    { name: 'x2', fmla: '+- r 0 x1' },
    { name: 'y2', fmla: '+- b 0 x1' },
    { name: 'il', fmla: '*/ x1 29289 100000' },
    { name: 'ir', fmla: '+- r 0 il' },
    { name: 'ib', fmla: '+- b 0 il' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'x1' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd2', swAng: 'cd4' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: '3cd4', swAng: 'cd4' },
        { type: 'lnTo', x: 'r', y: 'y2' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: '0', swAng: 'cd4' },
        { type: 'lnTo', x: 'x1', y: 'b' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd4', swAng: 'cd4' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'il', t: 'il', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// ellipse
// ---------------------------------------------------------------------------
def({
  name: 'ellipse',
  avLst: [],
  gdLst: [
    { name: 'idx', fmla: 'cos wd2 2700000' },
    { name: 'idy', fmla: 'sin hd2 2700000' },
    { name: 'il', fmla: '+- hc 0 idx' },
    { name: 'ir', fmla: '+- hc idx 0' },
    { name: 'it', fmla: '+- vc 0 idy' },
    { name: 'ib', fmla: '+- vc idy 0' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'vc' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: 'cd2', swAng: 'cd4' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: '3cd4', swAng: 'cd4' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: '0', swAng: 'cd4' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: 'cd4', swAng: 'cd4' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'il', y: 'it', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'il', y: 'ib', ang: 'cd4' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'ir', y: 'ib', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
    { x: 'ir', y: 'it', ang: '3cd4' },
  ],
  rect: { l: 'il', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// line
// ---------------------------------------------------------------------------
def({
  name: 'line',
  avLst: [],
  gdLst: [],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 't' },
        { type: 'lnTo', x: 'r', y: 'b' },
      ],
    },
  ],
  cxnLst: [
    { x: 'l', y: 't', ang: 'cd4' },
    { x: 'r', y: 'b', ang: '3cd4' },
  ],
});

// ---------------------------------------------------------------------------
// lineInv
// ---------------------------------------------------------------------------
def({
  name: 'lineInv',
  avLst: [],
  gdLst: [],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'b' },
        { type: 'lnTo', x: 'r', y: 't' },
      ],
    },
  ],
  cxnLst: [
    { x: 'l', y: 'b', ang: 'cd4' },
    { x: 'r', y: 't', ang: '3cd4' },
  ],
});

// ---------------------------------------------------------------------------
// triangle (isosceles)
// ---------------------------------------------------------------------------
def({
  name: 'triangle',
  avLst: [{ name: 'adj', fmla: 'val 50000' }],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 100000' },
    { name: 'x1', fmla: '*/ w a 200000' },
    { name: 'x2', fmla: '*/ w a 100000' },
    { name: 'x3', fmla: '+- x1 wd2 0' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'b' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'lnTo', x: 'r', y: 'b' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'x2', y: 't', ang: '3cd4' },
    { x: 'x1', y: 'vc', ang: 'cd2' },
    { x: 'l', y: 'b', ang: 'cd4' },
    { x: 'x2', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'b', ang: 'cd4' },
    { x: 'x3', y: 'vc', ang: '0' },
  ],
  rect: { l: 'x1', t: 'vc', r: 'x3', b: 'b' },
});

// ---------------------------------------------------------------------------
// rtTriangle (right triangle)
// ---------------------------------------------------------------------------
def({
  name: 'rtTriangle',
  avLst: [],
  gdLst: [
    { name: 'it', fmla: '*/ h 7 12' },
    { name: 'ir', fmla: '*/ w 7 12' },
    { name: 'ib', fmla: '*/ h 11 12' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'b' },
        { type: 'lnTo', x: 'l', y: 't' },
        { type: 'lnTo', x: 'r', y: 'b' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'l', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'l', y: 'b', ang: 'cd4' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'b', ang: 'cd4' },
    { x: 'hc', y: 'vc', ang: '0' },
  ],
  rect: { l: 'wd12', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// diamond
// ---------------------------------------------------------------------------
def({
  name: 'diamond',
  avLst: [],
  gdLst: [
    { name: 'ir', fmla: '*/ w 3 4' },
    { name: 'ib', fmla: '*/ h 3 4' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'vc' },
        { type: 'lnTo', x: 'hc', y: 't' },
        { type: 'lnTo', x: 'r', y: 'vc' },
        { type: 'lnTo', x: 'hc', y: 'b' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'wd4', t: 'hd4', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// pentagon
// ---------------------------------------------------------------------------
def({
  name: 'pentagon',
  avLst: [
    { name: 'hf', fmla: 'val 105146' },
    { name: 'vf', fmla: 'val 110557' },
  ],
  gdLst: [
    { name: 'swd2', fmla: '*/ wd2 hf 100000' },
    { name: 'shd2', fmla: '*/ hd2 vf 100000' },
    { name: 'svc', fmla: '*/ vc vf 100000' },
    { name: 'dx1', fmla: 'cos swd2 1080000' },
    { name: 'dx2', fmla: 'cos swd2 18360000' },
    { name: 'dy1', fmla: 'sin shd2 1080000' },
    { name: 'dy2', fmla: 'sin shd2 18360000' },
    { name: 'x1', fmla: '+- hc 0 dx1' },
    { name: 'x2', fmla: '+- hc 0 dx2' },
    { name: 'x3', fmla: '+- hc dx2 0' },
    { name: 'x4', fmla: '+- hc dx1 0' },
    { name: 'y1', fmla: '+- svc 0 dy1' },
    { name: 'y2', fmla: '+- svc 0 dy2' },
    { name: 'it', fmla: '*/ y1 dx2 dx1' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'x1', y: 'y1' },
        { type: 'lnTo', x: 'hc', y: 't' },
        { type: 'lnTo', x: 'x4', y: 'y1' },
        { type: 'lnTo', x: 'x3', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'y2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'x1', y: 'y1', ang: 'cd2' },
    { x: 'x2', y: 'y2', ang: 'cd4' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'x3', y: 'y2', ang: 'cd4' },
    { x: 'x4', y: 'y1', ang: '0' },
  ],
  rect: { l: 'x2', t: 'it', r: 'x3', b: 'y2' },
});

// ---------------------------------------------------------------------------
// hexagon
// ---------------------------------------------------------------------------
def({
  name: 'hexagon',
  avLst: [
    { name: 'adj', fmla: 'val 25000' },
    { name: 'vf', fmla: 'val 115470' },
  ],
  gdLst: [
    { name: 'maxAdj', fmla: '*/ 50000 w ss' },
    { name: 'a', fmla: 'pin 0 adj maxAdj' },
    { name: 'shd2', fmla: '*/ hd2 vf 100000' },
    { name: 'x1', fmla: '*/ ss a 100000' },
    { name: 'x2', fmla: '+- r 0 x1' },
    { name: 'dy1', fmla: 'sin shd2 3600000' },
    { name: 'y1', fmla: '+- vc 0 dy1' },
    { name: 'y2', fmla: '+- vc dy1 0' },
    { name: 'q1', fmla: '*/ maxAdj -1 2' },
    { name: 'q2', fmla: '+- a q1 0' },
    { name: 'q3', fmla: '?: q2 4 2' },
    { name: 'q4', fmla: '?: q2 3 2' },
    { name: 'q5', fmla: '?: q2 q1 0' },
    { name: 'q6', fmla: '+/ a q5 q1' },
    { name: 'q7', fmla: '*/ q6 q4 -1' },
    { name: 'q8', fmla: '+- q3 q7 0' },
    { name: 'il', fmla: '*/ w q8 24' },
    { name: 'it', fmla: '*/ h q8 24' },
    { name: 'ir', fmla: '+- r 0 il' },
    { name: 'ib', fmla: '+- b 0 it' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'vc' },
        { type: 'lnTo', x: 'x1', y: 'y1' },
        { type: 'lnTo', x: 'x2', y: 'y1' },
        { type: 'lnTo', x: 'r', y: 'vc' },
        { type: 'lnTo', x: 'x2', y: 'y2' },
        { type: 'lnTo', x: 'x1', y: 'y2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'r', y: 'vc', ang: '0' },
    { x: 'x2', y: 'y2', ang: 'cd4' },
    { x: 'x1', y: 'y2', ang: 'cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'x1', y: 'y1', ang: '3cd4' },
    { x: 'x2', y: 'y1', ang: '3cd4' },
  ],
  rect: { l: 'il', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// octagon
// ---------------------------------------------------------------------------
def({
  name: 'octagon',
  avLst: [{ name: 'adj', fmla: 'val 29289' }],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 50000' },
    { name: 'x1', fmla: '*/ ss a 100000' },
    { name: 'x2', fmla: '+- r 0 x1' },
    { name: 'y2', fmla: '+- b 0 x1' },
    { name: 'il', fmla: '*/ x1 1 2' },
    { name: 'ir', fmla: '+- r 0 il' },
    { name: 'ib', fmla: '+- b 0 il' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'x1' },
        { type: 'lnTo', x: 'x1', y: 't' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'lnTo', x: 'r', y: 'x1' },
        { type: 'lnTo', x: 'r', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'b' },
        { type: 'lnTo', x: 'x1', y: 'b' },
        { type: 'lnTo', x: 'l', y: 'y2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'r', y: 'x1', ang: '0' },
    { x: 'r', y: 'y2', ang: '0' },
    { x: 'x2', y: 'b', ang: 'cd4' },
    { x: 'x1', y: 'b', ang: 'cd4' },
    { x: 'l', y: 'y2', ang: 'cd2' },
    { x: 'l', y: 'x1', ang: 'cd2' },
    { x: 'x1', y: 't', ang: '3cd4' },
    { x: 'x2', y: 't', ang: '3cd4' },
  ],
  rect: { l: 'il', t: 'il', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// star4
// ---------------------------------------------------------------------------
def({
  name: 'star4',
  avLst: [{ name: 'adj', fmla: 'val 12500' }],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 50000' },
    { name: 'iwd2', fmla: '*/ wd2 a 50000' },
    { name: 'ihd2', fmla: '*/ hd2 a 50000' },
    { name: 'sdx', fmla: 'cos iwd2 2700000' },
    { name: 'sdy', fmla: 'sin ihd2 2700000' },
    { name: 'sx1', fmla: '+- hc 0 sdx' },
    { name: 'sx2', fmla: '+- hc sdx 0' },
    { name: 'sy1', fmla: '+- vc 0 sdy' },
    { name: 'sy2', fmla: '+- vc sdy 0' },
    { name: 'yAdj', fmla: '+- vc 0 ihd2' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'vc' },
        { type: 'lnTo', x: 'sx1', y: 'sy1' },
        { type: 'lnTo', x: 'hc', y: 't' },
        { type: 'lnTo', x: 'sx2', y: 'sy1' },
        { type: 'lnTo', x: 'r', y: 'vc' },
        { type: 'lnTo', x: 'sx2', y: 'sy2' },
        { type: 'lnTo', x: 'hc', y: 'b' },
        { type: 'lnTo', x: 'sx1', y: 'sy2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'sx1', t: 'sy1', r: 'sx2', b: 'sy2' },
});

// ---------------------------------------------------------------------------
// star5
// ---------------------------------------------------------------------------
def({
  name: 'star5',
  avLst: [
    { name: 'adj', fmla: 'val 19098' },
    { name: 'hf', fmla: 'val 105146' },
    { name: 'vf', fmla: 'val 110557' },
  ],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 50000' },
    { name: 'swd2', fmla: '*/ wd2 hf 100000' },
    { name: 'shd2', fmla: '*/ hd2 vf 100000' },
    { name: 'svc', fmla: '*/ vc vf 100000' },
    { name: 'dx1', fmla: 'cos swd2 1080000' },
    { name: 'dx2', fmla: 'cos swd2 18360000' },
    { name: 'dy1', fmla: 'sin shd2 1080000' },
    { name: 'dy2', fmla: 'sin shd2 18360000' },
    { name: 'x1', fmla: '+- hc 0 dx1' },
    { name: 'x2', fmla: '+- hc 0 dx2' },
    { name: 'x3', fmla: '+- hc dx2 0' },
    { name: 'x4', fmla: '+- hc dx1 0' },
    { name: 'y1', fmla: '+- svc 0 dy1' },
    { name: 'y2', fmla: '+- svc 0 dy2' },
    { name: 'iwd2', fmla: '*/ swd2 a 50000' },
    { name: 'ihd2', fmla: '*/ shd2 a 50000' },
    { name: 'sdx1', fmla: 'cos iwd2 20520000' },
    { name: 'sdx2', fmla: 'cos iwd2 3240000' },
    { name: 'sdy1', fmla: 'sin ihd2 3240000' },
    { name: 'sdy2', fmla: 'sin ihd2 20520000' },
    { name: 'sx1', fmla: '+- hc 0 sdx1' },
    { name: 'sx2', fmla: '+- hc 0 sdx2' },
    { name: 'sx3', fmla: '+- hc sdx2 0' },
    { name: 'sx4', fmla: '+- hc sdx1 0' },
    { name: 'sy1', fmla: '+- svc 0 sdy1' },
    { name: 'sy2', fmla: '+- svc 0 sdy2' },
    { name: 'sy3', fmla: '+- svc ihd2 0' },
    { name: 'yAdj', fmla: '+- svc 0 ihd2' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'x1', y: 'y1' },
        { type: 'lnTo', x: 'sx2', y: 'sy1' },
        { type: 'lnTo', x: 'hc', y: 't' },
        { type: 'lnTo', x: 'sx3', y: 'sy1' },
        { type: 'lnTo', x: 'x4', y: 'y1' },
        { type: 'lnTo', x: 'sx4', y: 'sy2' },
        { type: 'lnTo', x: 'x3', y: 'y2' },
        { type: 'lnTo', x: 'hc', y: 'sy3' },
        { type: 'lnTo', x: 'x2', y: 'y2' },
        { type: 'lnTo', x: 'sx1', y: 'sy2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'x1', y: 'y1', ang: 'cd2' },
    { x: 'x2', y: 'y2', ang: 'cd4' },
    { x: 'x3', y: 'y2', ang: 'cd4' },
    { x: 'x4', y: 'y1', ang: '0' },
  ],
  rect: { l: 'sx1', t: 'sy1', r: 'sx4', b: 'sy3' },
});

// ---------------------------------------------------------------------------
// star6
// ---------------------------------------------------------------------------
def({
  name: 'star6',
  avLst: [
    { name: 'adj', fmla: 'val 28868' },
    { name: 'hf', fmla: 'val 115470' },
  ],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 50000' },
    { name: 'swd2', fmla: '*/ wd2 hf 100000' },
    { name: 'dx1', fmla: 'cos swd2 1800000' },
    { name: 'x1', fmla: '+- hc 0 dx1' },
    { name: 'x2', fmla: '+- hc dx1 0' },
    { name: 'y2', fmla: '+- vc hd4 0' },
    { name: 'iwd2', fmla: '*/ swd2 a 50000' },
    { name: 'ihd2', fmla: '*/ hd2 a 50000' },
    { name: 'sdx2', fmla: '*/ iwd2 1 2' },
    { name: 'sx1', fmla: '+- hc 0 iwd2' },
    { name: 'sx2', fmla: '+- hc 0 sdx2' },
    { name: 'sx3', fmla: '+- hc sdx2 0' },
    { name: 'sx4', fmla: '+- hc iwd2 0' },
    { name: 'sdy1', fmla: 'sin ihd2 3600000' },
    { name: 'sy1', fmla: '+- vc 0 sdy1' },
    { name: 'sy2', fmla: '+- vc sdy1 0' },
    { name: 'yAdj', fmla: '+- vc 0 ihd2' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'x1', y: 'hd4' },
        { type: 'lnTo', x: 'sx2', y: 'sy1' },
        { type: 'lnTo', x: 'hc', y: 't' },
        { type: 'lnTo', x: 'sx3', y: 'sy1' },
        { type: 'lnTo', x: 'x2', y: 'hd4' },
        { type: 'lnTo', x: 'sx4', y: 'vc' },
        { type: 'lnTo', x: 'x2', y: 'y2' },
        { type: 'lnTo', x: 'sx3', y: 'sy2' },
        { type: 'lnTo', x: 'hc', y: 'b' },
        { type: 'lnTo', x: 'sx2', y: 'sy2' },
        { type: 'lnTo', x: 'x1', y: 'y2' },
        { type: 'lnTo', x: 'sx1', y: 'vc' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'x2', y: 'hd4', ang: '0' },
    { x: 'x2', y: 'y2', ang: '0' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'x1', y: 'y2', ang: 'cd2' },
    { x: 'x1', y: 'hd4', ang: 'cd2' },
    { x: 'hc', y: 't', ang: '3cd4' },
  ],
  rect: { l: 'sx1', t: 'sy1', r: 'sx4', b: 'sy2' },
});

// ---------------------------------------------------------------------------
// rightArrow
// ---------------------------------------------------------------------------
def({
  name: 'rightArrow',
  avLst: [
    { name: 'adj1', fmla: 'val 50000' },
    { name: 'adj2', fmla: 'val 50000' },
  ],
  gdLst: [
    { name: 'maxAdj2', fmla: '*/ 100000 w ss' },
    { name: 'a1', fmla: 'pin 0 adj1 100000' },
    { name: 'a2', fmla: 'pin 0 adj2 maxAdj2' },
    { name: 'dx1', fmla: '*/ ss a2 100000' },
    { name: 'x1', fmla: '+- r 0 dx1' },
    { name: 'dy1', fmla: '*/ h a1 200000' },
    { name: 'y1', fmla: '+- vc 0 dy1' },
    { name: 'y2', fmla: '+- vc dy1 0' },
    { name: 'dx2', fmla: '*/ y1 dx1 hd2' },
    { name: 'x2', fmla: '+- x1 dx2 0' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'y1' },
        { type: 'lnTo', x: 'x1', y: 'y1' },
        { type: 'lnTo', x: 'x1', y: 't' },
        { type: 'lnTo', x: 'r', y: 'vc' },
        { type: 'lnTo', x: 'x1', y: 'b' },
        { type: 'lnTo', x: 'x1', y: 'y2' },
        { type: 'lnTo', x: 'l', y: 'y2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'x1', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'x1', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'l', t: 'y1', r: 'x2', b: 'y2' },
});

// ---------------------------------------------------------------------------
// leftArrow
// ---------------------------------------------------------------------------
def({
  name: 'leftArrow',
  avLst: [
    { name: 'adj1', fmla: 'val 50000' },
    { name: 'adj2', fmla: 'val 50000' },
  ],
  gdLst: [
    { name: 'maxAdj2', fmla: '*/ 100000 w ss' },
    { name: 'a1', fmla: 'pin 0 adj1 100000' },
    { name: 'a2', fmla: 'pin 0 adj2 maxAdj2' },
    { name: 'dx2', fmla: '*/ ss a2 100000' },
    { name: 'x2', fmla: '+- l dx2 0' },
    { name: 'dy1', fmla: '*/ h a1 200000' },
    { name: 'y1', fmla: '+- vc 0 dy1' },
    { name: 'y2', fmla: '+- vc dy1 0' },
    { name: 'dx1', fmla: '*/ y1 dx2 hd2' },
    { name: 'x1', fmla: '+- x2 0 dx1' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'vc' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'lnTo', x: 'x2', y: 'y1' },
        { type: 'lnTo', x: 'r', y: 'y1' },
        { type: 'lnTo', x: 'r', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'b' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'x2', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'x2', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'x1', t: 'y1', r: 'r', b: 'y2' },
});

// ---------------------------------------------------------------------------
// upArrow
// ---------------------------------------------------------------------------
def({
  name: 'upArrow',
  avLst: [
    { name: 'adj1', fmla: 'val 50000' },
    { name: 'adj2', fmla: 'val 50000' },
  ],
  gdLst: [
    { name: 'maxAdj2', fmla: '*/ 100000 h ss' },
    { name: 'a1', fmla: 'pin 0 adj1 100000' },
    { name: 'a2', fmla: 'pin 0 adj2 maxAdj2' },
    { name: 'dy2', fmla: '*/ ss a2 100000' },
    { name: 'y2', fmla: '+- t dy2 0' },
    { name: 'dx1', fmla: '*/ w a1 200000' },
    { name: 'x1', fmla: '+- hc 0 dx1' },
    { name: 'x2', fmla: '+- hc dx1 0' },
    { name: 'dy1', fmla: '*/ x1 dy2 wd2' },
    { name: 'y1', fmla: '+- y2 0 dy1' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'y2' },
        { type: 'lnTo', x: 'hc', y: 't' },
        { type: 'lnTo', x: 'r', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'b' },
        { type: 'lnTo', x: 'x1', y: 'b' },
        { type: 'lnTo', x: 'x1', y: 'y2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'y2', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'y2', ang: '0' },
  ],
  rect: { l: 'x1', t: 'y1', r: 'x2', b: 'b' },
});

// ---------------------------------------------------------------------------
// downArrow
// ---------------------------------------------------------------------------
def({
  name: 'downArrow',
  avLst: [
    { name: 'adj1', fmla: 'val 50000' },
    { name: 'adj2', fmla: 'val 50000' },
  ],
  gdLst: [
    { name: 'maxAdj2', fmla: '*/ 100000 h ss' },
    { name: 'a1', fmla: 'pin 0 adj1 100000' },
    { name: 'a2', fmla: 'pin 0 adj2 maxAdj2' },
    { name: 'dy1', fmla: '*/ ss a2 100000' },
    { name: 'y1', fmla: '+- b 0 dy1' },
    { name: 'dx1', fmla: '*/ w a1 200000' },
    { name: 'x1', fmla: '+- hc 0 dx1' },
    { name: 'x2', fmla: '+- hc dx1 0' },
    { name: 'dy2', fmla: '*/ x1 dy1 wd2' },
    { name: 'y2', fmla: '+- y1 dy2 0' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'y1' },
        { type: 'lnTo', x: 'x1', y: 'y1' },
        { type: 'lnTo', x: 'x1', y: 't' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'lnTo', x: 'x2', y: 'y1' },
        { type: 'lnTo', x: 'r', y: 'y1' },
        { type: 'lnTo', x: 'hc', y: 'b' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'y1', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'y1', ang: '0' },
  ],
  rect: { l: 'x1', t: 't', r: 'x2', b: 'y2' },
});

// ---------------------------------------------------------------------------
// leftRightArrow
// ---------------------------------------------------------------------------
def({
  name: 'leftRightArrow',
  avLst: [
    { name: 'adj1', fmla: 'val 50000' },
    { name: 'adj2', fmla: 'val 50000' },
  ],
  gdLst: [
    { name: 'maxAdj2', fmla: '*/ 50000 w ss' },
    { name: 'a1', fmla: 'pin 0 adj1 100000' },
    { name: 'a2', fmla: 'pin 0 adj2 maxAdj2' },
    { name: 'x2', fmla: '*/ ss a2 100000' },
    { name: 'x3', fmla: '+- r 0 x2' },
    { name: 'dy', fmla: '*/ h a1 200000' },
    { name: 'y1', fmla: '+- vc 0 dy' },
    { name: 'y2', fmla: '+- vc dy 0' },
    { name: 'dx1', fmla: '*/ y1 x2 hd2' },
    { name: 'x1', fmla: '+- x2 0 dx1' },
    { name: 'x4', fmla: '+- x3 dx1 0' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'vc' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'lnTo', x: 'x2', y: 'y1' },
        { type: 'lnTo', x: 'x3', y: 'y1' },
        { type: 'lnTo', x: 'x3', y: 't' },
        { type: 'lnTo', x: 'r', y: 'vc' },
        { type: 'lnTo', x: 'x3', y: 'b' },
        { type: 'lnTo', x: 'x3', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'b' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'r', y: 'vc', ang: '0' },
    { x: 'x3', y: 'b', ang: 'cd4' },
    { x: 'x2', y: 'b', ang: 'cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'x2', y: 't', ang: '3cd4' },
    { x: 'x3', y: 't', ang: '3cd4' },
  ],
  rect: { l: 'x1', t: 'y1', r: 'x4', b: 'y2' },
});

// ---------------------------------------------------------------------------
// upDownArrow
// ---------------------------------------------------------------------------
def({
  name: 'upDownArrow',
  avLst: [
    { name: 'adj1', fmla: 'val 50000' },
    { name: 'adj2', fmla: 'val 50000' },
  ],
  gdLst: [
    { name: 'maxAdj2', fmla: '*/ 50000 h ss' },
    { name: 'a1', fmla: 'pin 0 adj1 100000' },
    { name: 'a2', fmla: 'pin 0 adj2 maxAdj2' },
    { name: 'y2', fmla: '*/ ss a2 100000' },
    { name: 'y3', fmla: '+- b 0 y2' },
    { name: 'dx1', fmla: '*/ w a1 200000' },
    { name: 'x1', fmla: '+- hc 0 dx1' },
    { name: 'x2', fmla: '+- hc dx1 0' },
    { name: 'dy1', fmla: '*/ x1 y2 wd2' },
    { name: 'y1', fmla: '+- y2 0 dy1' },
    { name: 'y4', fmla: '+- y3 dy1 0' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'y2' },
        { type: 'lnTo', x: 'hc', y: 't' },
        { type: 'lnTo', x: 'r', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'y3' },
        { type: 'lnTo', x: 'r', y: 'y3' },
        { type: 'lnTo', x: 'hc', y: 'b' },
        { type: 'lnTo', x: 'l', y: 'y3' },
        { type: 'lnTo', x: 'x1', y: 'y3' },
        { type: 'lnTo', x: 'x1', y: 'y2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'y2', ang: 'cd2' },
    { x: 'x1', y: 'vc', ang: 'cd2' },
    { x: 'l', y: 'y3', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'y3', ang: '0' },
    { x: 'x2', y: 'vc', ang: '0' },
    { x: 'r', y: 'y2', ang: '0' },
  ],
  rect: { l: 'x1', t: 'y1', r: 'x2', b: 'y4' },
});

// ---------------------------------------------------------------------------
// chevron
// ---------------------------------------------------------------------------
def({
  name: 'chevron',
  avLst: [{ name: 'adj', fmla: 'val 50000' }],
  gdLst: [
    { name: 'maxAdj', fmla: '*/ 100000 w ss' },
    { name: 'a', fmla: 'pin 0 adj maxAdj' },
    { name: 'x1', fmla: '*/ ss a 100000' },
    { name: 'x2', fmla: '+- r 0 x1' },
    { name: 'x3', fmla: '*/ x2 1 2' },
    { name: 'dx', fmla: '+- x2 0 x1' },
    { name: 'il', fmla: '?: dx x1 l' },
    { name: 'ir', fmla: '?: dx x2 r' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 't' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'lnTo', x: 'r', y: 'vc' },
        { type: 'lnTo', x: 'x2', y: 'b' },
        { type: 'lnTo', x: 'l', y: 'b' },
        { type: 'lnTo', x: 'x1', y: 'vc' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'x3', y: 't', ang: '3cd4' },
    { x: 'x1', y: 'vc', ang: 'cd2' },
    { x: 'x3', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'il', t: 't', r: 'ir', b: 'b' },
});

// ---------------------------------------------------------------------------
// flowChartProcess
// ---------------------------------------------------------------------------
def({
  name: 'flowChartProcess',
  avLst: [],
  gdLst: [],
  pathLst: [
    {
      w: 1,
      h: 1,
      commands: [
        { type: 'moveTo', x: '0', y: '0' },
        { type: 'lnTo', x: '1', y: '0' },
        { type: 'lnTo', x: '1', y: '1' },
        { type: 'lnTo', x: '0', y: '1' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'l', t: 't', r: 'r', b: 'b' },
});

// ---------------------------------------------------------------------------
// flowChartDecision
// ---------------------------------------------------------------------------
def({
  name: 'flowChartDecision',
  avLst: [],
  gdLst: [
    { name: 'ir', fmla: '*/ w 3 4' },
    { name: 'ib', fmla: '*/ h 3 4' },
  ],
  pathLst: [
    {
      w: 2,
      h: 2,
      commands: [
        { type: 'moveTo', x: '0', y: '1' },
        { type: 'lnTo', x: '1', y: '0' },
        { type: 'lnTo', x: '2', y: '1' },
        { type: 'lnTo', x: '1', y: '2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'wd4', t: 'hd4', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// flowChartTerminator
// ---------------------------------------------------------------------------
def({
  name: 'flowChartTerminator',
  avLst: [],
  gdLst: [
    { name: 'il', fmla: '*/ w 1018 21600' },
    { name: 'ir', fmla: '*/ w 20582 21600' },
    { name: 'it', fmla: '*/ h 3163 21600' },
    { name: 'ib', fmla: '*/ h 18437 21600' },
  ],
  pathLst: [
    {
      w: 21600,
      h: 21600,
      commands: [
        { type: 'moveTo', x: '3475', y: '0' },
        { type: 'lnTo', x: '18125', y: '0' },
        { type: 'arcTo', wR: '3475', hR: '10800', stAng: '3cd4', swAng: 'cd2' },
        { type: 'lnTo', x: '3475', y: '21600' },
        { type: 'arcTo', wR: '3475', hR: '10800', stAng: 'cd4', swAng: 'cd2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'il', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// flowChartConnector
// ---------------------------------------------------------------------------
def({
  name: 'flowChartConnector',
  avLst: [],
  gdLst: [
    { name: 'idx', fmla: 'cos wd2 2700000' },
    { name: 'idy', fmla: 'sin hd2 2700000' },
    { name: 'il', fmla: '+- hc 0 idx' },
    { name: 'ir', fmla: '+- hc idx 0' },
    { name: 'it', fmla: '+- vc 0 idy' },
    { name: 'ib', fmla: '+- vc idy 0' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'vc' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: 'cd2', swAng: 'cd4' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: '3cd4', swAng: 'cd4' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: '0', swAng: 'cd4' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: 'cd4', swAng: 'cd4' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'il', y: 'it', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'il', y: 'ib', ang: 'cd4' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'ir', y: 'ib', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
    { x: 'ir', y: 'it', ang: '3cd4' },
  ],
  rect: { l: 'il', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// flowChartAlternateProcess
// ---------------------------------------------------------------------------
def({
  name: 'flowChartAlternateProcess',
  avLst: [],
  gdLst: [
    { name: 'x2', fmla: '+- r 0 ssd6' },
    { name: 'y2', fmla: '+- b 0 ssd6' },
    { name: 'il', fmla: '*/ ssd6 29289 100000' },
    { name: 'ir', fmla: '+- r 0 il' },
    { name: 'ib', fmla: '+- b 0 il' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'ssd6' },
        {
          type: 'arcTo',
          wR: 'ssd6',
          hR: 'ssd6',
          stAng: 'cd2',
          swAng: 'cd4',
        },
        { type: 'lnTo', x: 'x2', y: 't' },
        {
          type: 'arcTo',
          wR: 'ssd6',
          hR: 'ssd6',
          stAng: '3cd4',
          swAng: 'cd4',
        },
        { type: 'lnTo', x: 'r', y: 'y2' },
        {
          type: 'arcTo',
          wR: 'ssd6',
          hR: 'ssd6',
          stAng: '0',
          swAng: 'cd4',
        },
        { type: 'lnTo', x: 'ssd6', y: 'b' },
        {
          type: 'arcTo',
          wR: 'ssd6',
          hR: 'ssd6',
          stAng: 'cd4',
          swAng: 'cd4',
        },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'il', t: 'il', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// flowChartPredefinedProcess
// ---------------------------------------------------------------------------
def({
  name: 'flowChartPredefinedProcess',
  avLst: [],
  gdLst: [{ name: 'x2', fmla: '*/ w 7 8' }],
  pathLst: [
    {
      w: 1,
      h: 1,
      stroke: false,
      commands: [
        { type: 'moveTo', x: '0', y: '0' },
        { type: 'lnTo', x: '1', y: '0' },
        { type: 'lnTo', x: '1', y: '1' },
        { type: 'lnTo', x: '0', y: '1' },
        { type: 'close' },
      ],
    },
    {
      w: 8,
      h: 8,
      fill: 'none',
      commands: [
        { type: 'moveTo', x: '1', y: '0' },
        { type: 'lnTo', x: '1', y: '8' },
        { type: 'moveTo', x: '7', y: '0' },
        { type: 'lnTo', x: '7', y: '8' },
      ],
    },
    {
      w: 1,
      h: 1,
      fill: 'none',
      commands: [
        { type: 'moveTo', x: '0', y: '0' },
        { type: 'lnTo', x: '1', y: '0' },
        { type: 'lnTo', x: '1', y: '1' },
        { type: 'lnTo', x: '0', y: '1' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'wd8', t: 't', r: 'x2', b: 'b' },
});

// ---------------------------------------------------------------------------
// plus (cross)
// ---------------------------------------------------------------------------
def({
  name: 'plus',
  avLst: [{ name: 'adj', fmla: 'val 25000' }],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 50000' },
    { name: 'x1', fmla: '*/ ss a 100000' },
    { name: 'x2', fmla: '+- r 0 x1' },
    { name: 'y2', fmla: '+- b 0 x1' },
    { name: 'd', fmla: '+- w 0 h' },
    { name: 'il', fmla: '?: d l x1' },
    { name: 'ir', fmla: '?: d r x2' },
    { name: 'it', fmla: '?: d x1 t' },
    { name: 'ib', fmla: '?: d y2 b' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'x1' },
        { type: 'lnTo', x: 'x1', y: 'x1' },
        { type: 'lnTo', x: 'x1', y: 't' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'lnTo', x: 'x2', y: 'x1' },
        { type: 'lnTo', x: 'r', y: 'x1' },
        { type: 'lnTo', x: 'r', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'y2' },
        { type: 'lnTo', x: 'x2', y: 'b' },
        { type: 'lnTo', x: 'x1', y: 'b' },
        { type: 'lnTo', x: 'x1', y: 'y2' },
        { type: 'lnTo', x: 'l', y: 'y2' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'il', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// trapezoid
// ---------------------------------------------------------------------------
def({
  name: 'trapezoid',
  avLst: [{ name: 'adj', fmla: 'val 25000' }],
  gdLst: [
    { name: 'maxAdj', fmla: '*/ 50000 w ss' },
    { name: 'a', fmla: 'pin 0 adj maxAdj' },
    { name: 'x1', fmla: '*/ ss a 200000' },
    { name: 'x2', fmla: '*/ ss a 100000' },
    { name: 'x3', fmla: '+- r 0 x2' },
    { name: 'x4', fmla: '+- r 0 x1' },
    { name: 'il', fmla: '*/ wd3 a maxAdj' },
    { name: 'it', fmla: '*/ hd3 a maxAdj' },
    { name: 'ir', fmla: '+- r 0 il' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'b' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'lnTo', x: 'x3', y: 't' },
        { type: 'lnTo', x: 'r', y: 'b' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'x1', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'x4', y: 'vc', ang: '0' },
  ],
  rect: { l: 'il', t: 'it', r: 'ir', b: 'b' },
});

// ---------------------------------------------------------------------------
// parallelogram
// ---------------------------------------------------------------------------
def({
  name: 'parallelogram',
  avLst: [{ name: 'adj', fmla: 'val 25000' }],
  gdLst: [
    { name: 'maxAdj', fmla: '*/ 100000 w ss' },
    { name: 'a', fmla: 'pin 0 adj maxAdj' },
    { name: 'x1', fmla: '*/ ss a 200000' },
    { name: 'x2', fmla: '*/ ss a 100000' },
    { name: 'x6', fmla: '+- r 0 x1' },
    { name: 'x5', fmla: '+- r 0 x2' },
    { name: 'x3', fmla: '*/ x5 1 2' },
    { name: 'x4', fmla: '+- r 0 x3' },
    { name: 'il', fmla: '*/ wd2 a maxAdj' },
    { name: 'q1', fmla: '*/ 5 a maxAdj' },
    { name: 'q2', fmla: '+/ 1 q1 12' },
    { name: 'il2', fmla: '*/ q2 w 1' },
    { name: 'it', fmla: '*/ q2 h 1' },
    { name: 'ir', fmla: '+- r 0 il2' },
    { name: 'ib', fmla: '+- b 0 it' },
    { name: 'q3', fmla: '*/ h hc x2' },
    { name: 'y1', fmla: 'pin 0 q3 h' },
    { name: 'y2', fmla: '+- b 0 y1' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'b' },
        { type: 'lnTo', x: 'x2', y: 't' },
        { type: 'lnTo', x: 'r', y: 't' },
        { type: 'lnTo', x: 'x5', y: 'b' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 'y2', ang: '3cd4' },
    { x: 'x4', y: 't', ang: '3cd4' },
    { x: 'x6', y: 'vc', ang: '0' },
    { x: 'x3', y: 'b', ang: 'cd4' },
    { x: 'hc', y: 'y1', ang: 'cd4' },
    { x: 'x1', y: 'vc', ang: 'cd2' },
  ],
  rect: { l: 'il2', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// donut
// ---------------------------------------------------------------------------
def({
  name: 'donut',
  avLst: [{ name: 'adj', fmla: 'val 25000' }],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 50000' },
    { name: 'dr', fmla: '*/ ss a 100000' },
    { name: 'iwd2', fmla: '+- wd2 0 dr' },
    { name: 'ihd2', fmla: '+- hd2 0 dr' },
    { name: 'idx', fmla: 'cos wd2 2700000' },
    { name: 'idy', fmla: 'sin hd2 2700000' },
    { name: 'il', fmla: '+- hc 0 idx' },
    { name: 'ir', fmla: '+- hc idx 0' },
    { name: 'it', fmla: '+- vc 0 idy' },
    { name: 'ib', fmla: '+- vc idy 0' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 'vc' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: 'cd2', swAng: 'cd4' },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'hd2',
          stAng: '3cd4',
          swAng: 'cd4',
        },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: '0', swAng: 'cd4' },
        { type: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: 'cd4', swAng: 'cd4' },
        { type: 'close' },
        { type: 'moveTo', x: 'dr', y: 'vc' },
        {
          type: 'arcTo',
          wR: 'iwd2',
          hR: 'ihd2',
          stAng: 'cd2',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'iwd2',
          hR: 'ihd2',
          stAng: 'cd4',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'iwd2',
          hR: 'ihd2',
          stAng: '0',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'iwd2',
          hR: 'ihd2',
          stAng: '3cd4',
          swAng: '-5400000',
        },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'il', y: 'it', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'il', y: 'ib', ang: 'cd4' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'ir', y: 'ib', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
    { x: 'ir', y: 'it', ang: '3cd4' },
  ],
  rect: { l: 'il', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// heart
// ---------------------------------------------------------------------------
def({
  name: 'heart',
  avLst: [],
  gdLst: [
    { name: 'dx1', fmla: '*/ w 49 48' },
    { name: 'dx2', fmla: '*/ w 10 48' },
    { name: 'x1', fmla: '+- hc 0 dx1' },
    { name: 'x2', fmla: '+- hc 0 dx2' },
    { name: 'x3', fmla: '+- hc dx2 0' },
    { name: 'x4', fmla: '+- hc dx1 0' },
    { name: 'y1', fmla: '+- t 0 hd3' },
    { name: 'il', fmla: '*/ w 1 6' },
    { name: 'ir', fmla: '*/ w 5 6' },
    { name: 'ib', fmla: '*/ h 2 3' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'hc', y: 'hd4' },
        {
          type: 'cubicBezTo',
          pts: [
            { x: 'x3', y: 'y1' },
            { x: 'x4', y: 'hd4' },
            { x: 'hc', y: 'b' },
          ],
        },
        {
          type: 'cubicBezTo',
          pts: [
            { x: 'x1', y: 'hd4' },
            { x: 'x2', y: 'y1' },
            { x: 'hc', y: 'hd4' },
          ],
        },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 'hd4', ang: '3cd4' },
    { x: 'hc', y: 'b', ang: 'cd4' },
  ],
  rect: { l: 'il', t: 'hd4', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// cloud
// ---------------------------------------------------------------------------
def({
  name: 'cloud',
  avLst: [],
  gdLst: [
    { name: 'il', fmla: '*/ w 2977 21600' },
    { name: 'it', fmla: '*/ h 3262 21600' },
    { name: 'ir', fmla: '*/ w 17087 21600' },
    { name: 'ib', fmla: '*/ h 17337 21600' },
    { name: 'g27', fmla: '*/ w 67 21600' },
    { name: 'g28', fmla: '*/ h 21577 21600' },
    { name: 'g29', fmla: '*/ w 21582 21600' },
    { name: 'g30', fmla: '*/ h 1235 21600' },
  ],
  pathLst: [
    {
      w: 43200,
      h: 43200,
      commands: [
        { type: 'moveTo', x: '3900', y: '14370' },
        {
          type: 'arcTo',
          wR: '6753',
          hR: '9190',
          stAng: '-11429249',
          swAng: '7426832',
        },
        {
          type: 'arcTo',
          wR: '5333',
          hR: '7267',
          stAng: '-8646143',
          swAng: '5396714',
        },
        {
          type: 'arcTo',
          wR: '4365',
          hR: '5945',
          stAng: '-8748475',
          swAng: '5983381',
        },
        {
          type: 'arcTo',
          wR: '4857',
          hR: '6595',
          stAng: '-7859164',
          swAng: '7034504',
        },
        {
          type: 'arcTo',
          wR: '5333',
          hR: '7273',
          stAng: '-4722533',
          swAng: '6541615',
        },
        {
          type: 'arcTo',
          wR: '6775',
          hR: '9220',
          stAng: '-2776035',
          swAng: '7816140',
        },
        {
          type: 'arcTo',
          wR: '5785',
          hR: '7867',
          stAng: '37501',
          swAng: '6842000',
        },
        {
          type: 'arcTo',
          wR: '6752',
          hR: '9215',
          stAng: '1347096',
          swAng: '6910353',
        },
        {
          type: 'arcTo',
          wR: '7720',
          hR: '10543',
          stAng: '3974558',
          swAng: '4542661',
        },
        {
          type: 'arcTo',
          wR: '4360',
          hR: '5918',
          stAng: '-16496525',
          swAng: '8804134',
        },
        {
          type: 'arcTo',
          wR: '4345',
          hR: '5945',
          stAng: '-14809710',
          swAng: '9151131',
        },
        { type: 'close' },
      ],
    },
    {
      w: 43200,
      h: 43200,
      fill: 'none',
      commands: [
        { type: 'moveTo', x: '4693', y: '26177' },
        {
          type: 'arcTo',
          wR: '4345',
          hR: '5945',
          stAng: '5204520',
          swAng: '1585770',
        },
        { type: 'moveTo', x: '6928', y: '34899' },
        {
          type: 'arcTo',
          wR: '4360',
          hR: '5918',
          stAng: '4416628',
          swAng: '686848',
        },
        { type: 'moveTo', x: '16478', y: '39090' },
        {
          type: 'arcTo',
          wR: '6752',
          hR: '9215',
          stAng: '8257449',
          swAng: '844866',
        },
        { type: 'moveTo', x: '28827', y: '34751' },
        {
          type: 'arcTo',
          wR: '6752',
          hR: '9215',
          stAng: '387196',
          swAng: '959901',
        },
        { type: 'moveTo', x: '34129', y: '22954' },
        {
          type: 'arcTo',
          wR: '5785',
          hR: '7867',
          stAng: '-4217541',
          swAng: '4255042',
        },
        { type: 'moveTo', x: '41798', y: '15354' },
        {
          type: 'arcTo',
          wR: '5333',
          hR: '7273',
          stAng: '1819082',
          swAng: '1665090',
        },
        { type: 'moveTo', x: '38324', y: '5426' },
        {
          type: 'arcTo',
          wR: '4857',
          hR: '6595',
          stAng: '-824660',
          swAng: '891534',
        },
        { type: 'moveTo', x: '29078', y: '3952' },
        {
          type: 'arcTo',
          wR: '4857',
          hR: '6595',
          stAng: '-8950887',
          swAng: '1091722',
        },
        { type: 'moveTo', x: '22141', y: '4720' },
        {
          type: 'arcTo',
          wR: '4365',
          hR: '5945',
          stAng: '-9809656',
          swAng: '1061181',
        },
        { type: 'moveTo', x: '14000', y: '5192' },
        {
          type: 'arcTo',
          wR: '6753',
          hR: '9190',
          stAng: '-4002417',
          swAng: '739161',
        },
        { type: 'moveTo', x: '4127', y: '15789' },
        {
          type: 'arcTo',
          wR: '6753',
          hR: '9190',
          stAng: '9459261',
          swAng: '711490',
        },
      ],
    },
  ],
  cxnLst: [
    { x: 'g29', y: 'vc', ang: '0' },
    { x: 'hc', y: 'g28', ang: 'cd4' },
    { x: 'g27', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'g30', ang: '3cd4' },
  ],
  rect: { l: 'il', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// can (cylinder)
// ---------------------------------------------------------------------------
def({
  name: 'can',
  avLst: [{ name: 'adj', fmla: 'val 25000' }],
  gdLst: [
    { name: 'maxAdj', fmla: '*/ 50000 h ss' },
    { name: 'a', fmla: 'pin 0 adj maxAdj' },
    { name: 'y1', fmla: '*/ ss a 200000' },
    { name: 'y2', fmla: '+- y1 y1 0' },
    { name: 'y3', fmla: '+- b 0 y1' },
  ],
  pathLst: [
    {
      stroke: false,
      commands: [
        { type: 'moveTo', x: 'l', y: 'y1' },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: 'cd2',
          swAng: '-10800000',
        },
        { type: 'lnTo', x: 'r', y: 'y3' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: '0', swAng: 'cd2' },
        { type: 'close' },
      ],
    },
    {
      stroke: false,
      fill: 'lighten',
      commands: [
        { type: 'moveTo', x: 'l', y: 'y1' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: 'cd2', swAng: 'cd2' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: '0', swAng: 'cd2' },
        { type: 'close' },
      ],
    },
    {
      fill: 'none',
      commands: [
        { type: 'moveTo', x: 'r', y: 'y1' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: '0', swAng: 'cd2' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: 'cd2', swAng: 'cd2' },
        { type: 'lnTo', x: 'r', y: 'y3' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: '0', swAng: 'cd2' },
        { type: 'lnTo', x: 'l', y: 'y1' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 'y2', ang: '3cd4' },
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'l', t: 'y2', r: 'r', b: 'y3' },
});

// ---------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------
def({
  name: 'frame',
  avLst: [{ name: 'adj1', fmla: 'val 12500' }],
  gdLst: [
    { name: 'a1', fmla: 'pin 0 adj1 50000' },
    { name: 'x1', fmla: '*/ ss a1 100000' },
    { name: 'x4', fmla: '+- r 0 x1' },
    { name: 'y4', fmla: '+- b 0 x1' },
  ],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 't' },
        { type: 'lnTo', x: 'r', y: 't' },
        { type: 'lnTo', x: 'r', y: 'b' },
        { type: 'lnTo', x: 'l', y: 'b' },
        { type: 'close' },
        { type: 'moveTo', x: 'x1', y: 'x1' },
        { type: 'lnTo', x: 'x1', y: 'y4' },
        { type: 'lnTo', x: 'x4', y: 'y4' },
        { type: 'lnTo', x: 'x4', y: 'x1' },
        { type: 'close' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'x1', t: 'x1', r: 'x4', b: 'y4' },
});

// ---------------------------------------------------------------------------
// bracketPair
// ---------------------------------------------------------------------------
def({
  name: 'bracketPair',
  avLst: [{ name: 'adj', fmla: 'val 16667' }],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 50000' },
    { name: 'x1', fmla: '*/ ss a 100000' },
    { name: 'x2', fmla: '+- r 0 x1' },
    { name: 'y2', fmla: '+- b 0 x1' },
    { name: 'il', fmla: '*/ x1 29289 100000' },
    { name: 'ir', fmla: '+- r 0 il' },
    { name: 'ib', fmla: '+- b 0 il' },
  ],
  pathLst: [
    {
      stroke: false,
      commands: [
        { type: 'moveTo', x: 'l', y: 'x1' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd2', swAng: 'cd4' },
        { type: 'lnTo', x: 'x2', y: 't' },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: '3cd4',
          swAng: 'cd4',
        },
        { type: 'lnTo', x: 'r', y: 'y2' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: '0', swAng: 'cd4' },
        { type: 'lnTo', x: 'x1', y: 'b' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd4', swAng: 'cd4' },
        { type: 'close' },
      ],
    },
    {
      fill: 'none',
      commands: [
        { type: 'moveTo', x: 'x1', y: 'b' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd4', swAng: 'cd4' },
        { type: 'lnTo', x: 'l', y: 'x1' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd2', swAng: 'cd4' },
        { type: 'moveTo', x: 'x2', y: 't' },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: '3cd4',
          swAng: 'cd4',
        },
        { type: 'lnTo', x: 'r', y: 'y2' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: '0', swAng: 'cd4' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'il', t: 'il', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// bracePair
// ---------------------------------------------------------------------------
def({
  name: 'bracePair',
  avLst: [{ name: 'adj', fmla: 'val 8333' }],
  gdLst: [
    { name: 'a', fmla: 'pin 0 adj 25000' },
    { name: 'x1', fmla: '*/ ss a 100000' },
    { name: 'x2', fmla: '*/ ss a 50000' },
    { name: 'x3', fmla: '+- r 0 x2' },
    { name: 'x4', fmla: '+- r 0 x1' },
    { name: 'y2', fmla: '+- vc 0 x1' },
    { name: 'y3', fmla: '+- vc x1 0' },
    { name: 'y4', fmla: '+- b 0 x1' },
    { name: 'it', fmla: '*/ x1 29289 100000' },
    { name: 'il', fmla: '+- x1 it 0' },
    { name: 'ir', fmla: '+- r 0 il' },
    { name: 'ib', fmla: '+- b 0 it' },
  ],
  pathLst: [
    {
      stroke: false,
      commands: [
        { type: 'moveTo', x: 'x2', y: 'b' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd4', swAng: 'cd4' },
        { type: 'lnTo', x: 'x1', y: 'y3' },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: '0',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: 'cd4',
          swAng: '-5400000',
        },
        { type: 'lnTo', x: 'x1', y: 'x1' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd2', swAng: 'cd4' },
        { type: 'lnTo', x: 'x3', y: 't' },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: '3cd4',
          swAng: 'cd4',
        },
        { type: 'lnTo', x: 'x4', y: 'y2' },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: 'cd2',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: '3cd4',
          swAng: '-5400000',
        },
        { type: 'lnTo', x: 'x4', y: 'y4' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: '0', swAng: 'cd4' },
        { type: 'close' },
      ],
    },
    {
      fill: 'none',
      commands: [
        { type: 'moveTo', x: 'x2', y: 'b' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd4', swAng: 'cd4' },
        { type: 'lnTo', x: 'x1', y: 'y3' },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: '0',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: 'cd4',
          swAng: '-5400000',
        },
        { type: 'lnTo', x: 'x1', y: 'x1' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: 'cd2', swAng: 'cd4' },
        { type: 'moveTo', x: 'x3', y: 't' },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: '3cd4',
          swAng: 'cd4',
        },
        { type: 'lnTo', x: 'x4', y: 'y2' },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: 'cd2',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'x1',
          hR: 'x1',
          stAng: '3cd4',
          swAng: '-5400000',
        },
        { type: 'lnTo', x: 'x4', y: 'y4' },
        { type: 'arcTo', wR: 'x1', hR: 'x1', stAng: '0', swAng: 'cd4' },
      ],
    },
  ],
  cxnLst: [
    { x: 'hc', y: 't', ang: '3cd4' },
    { x: 'l', y: 'vc', ang: 'cd2' },
    { x: 'hc', y: 'b', ang: 'cd4' },
    { x: 'r', y: 'vc', ang: '0' },
  ],
  rect: { l: 'il', t: 'il', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// leftBrace
// ---------------------------------------------------------------------------
def({
  name: 'leftBrace',
  avLst: [
    { name: 'adj1', fmla: 'val 8333' },
    { name: 'adj2', fmla: 'val 50000' },
  ],
  gdLst: [
    { name: 'a2', fmla: 'pin 0 adj2 100000' },
    { name: 'q1', fmla: '+- 100000 0 a2' },
    { name: 'q2', fmla: 'min q1 a2' },
    { name: 'q3', fmla: '*/ q2 1 2' },
    { name: 'maxAdj1', fmla: '*/ q3 h ss' },
    { name: 'a1', fmla: 'pin 0 adj1 maxAdj1' },
    { name: 'y1', fmla: '*/ ss a1 100000' },
    { name: 'y3', fmla: '*/ h a2 100000' },
    { name: 'y4', fmla: '+- y3 y1 0' },
    { name: 'dx1', fmla: 'cos wd2 2700000' },
    { name: 'dy1', fmla: 'sin y1 2700000' },
    { name: 'il', fmla: '+- r 0 dx1' },
    { name: 'it', fmla: '+- y1 0 dy1' },
    { name: 'ib', fmla: '+- b dy1 y1' },
  ],
  pathLst: [
    {
      stroke: false,
      commands: [
        { type: 'moveTo', x: 'r', y: 'b' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: 'cd4', swAng: 'cd4' },
        { type: 'lnTo', x: 'hc', y: 'y4' },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: '0',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: 'cd4',
          swAng: '-5400000',
        },
        { type: 'lnTo', x: 'hc', y: 'y1' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: 'cd2', swAng: 'cd4' },
        { type: 'close' },
      ],
    },
    {
      fill: 'none',
      commands: [
        { type: 'moveTo', x: 'r', y: 'b' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: 'cd4', swAng: 'cd4' },
        { type: 'lnTo', x: 'hc', y: 'y4' },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: '0',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: 'cd4',
          swAng: '-5400000',
        },
        { type: 'lnTo', x: 'hc', y: 'y1' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: 'cd2', swAng: 'cd4' },
      ],
    },
  ],
  cxnLst: [
    { x: 'r', y: 't', ang: 'cd4' },
    { x: 'l', y: 'y3', ang: 'cd2' },
    { x: 'r', y: 'b', ang: '3cd4' },
  ],
  rect: { l: 'il', t: 'it', r: 'r', b: 'ib' },
});

// ---------------------------------------------------------------------------
// rightBrace
// ---------------------------------------------------------------------------
def({
  name: 'rightBrace',
  avLst: [
    { name: 'adj1', fmla: 'val 8333' },
    { name: 'adj2', fmla: 'val 50000' },
  ],
  gdLst: [
    { name: 'a2', fmla: 'pin 0 adj2 100000' },
    { name: 'q1', fmla: '+- 100000 0 a2' },
    { name: 'q2', fmla: 'min q1 a2' },
    { name: 'q3', fmla: '*/ q2 1 2' },
    { name: 'maxAdj1', fmla: '*/ q3 h ss' },
    { name: 'a1', fmla: 'pin 0 adj1 maxAdj1' },
    { name: 'y1', fmla: '*/ ss a1 100000' },
    { name: 'y3', fmla: '*/ h a2 100000' },
    { name: 'y2', fmla: '+- y3 0 y1' },
    { name: 'y4', fmla: '+- b 0 y1' },
    { name: 'dx1', fmla: 'cos wd2 2700000' },
    { name: 'dy1', fmla: 'sin y1 2700000' },
    { name: 'ir', fmla: '+- l dx1 0' },
    { name: 'it', fmla: '+- y1 0 dy1' },
    { name: 'ib', fmla: '+- b dy1 y1' },
  ],
  pathLst: [
    {
      stroke: false,
      commands: [
        { type: 'moveTo', x: 'l', y: 't' },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: '3cd4',
          swAng: 'cd4',
        },
        { type: 'lnTo', x: 'hc', y: 'y2' },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: 'cd2',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: '3cd4',
          swAng: '-5400000',
        },
        { type: 'lnTo', x: 'hc', y: 'y4' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: '0', swAng: 'cd4' },
        { type: 'close' },
      ],
    },
    {
      fill: 'none',
      commands: [
        { type: 'moveTo', x: 'l', y: 't' },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: '3cd4',
          swAng: 'cd4',
        },
        { type: 'lnTo', x: 'hc', y: 'y2' },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: 'cd2',
          swAng: '-5400000',
        },
        {
          type: 'arcTo',
          wR: 'wd2',
          hR: 'y1',
          stAng: '3cd4',
          swAng: '-5400000',
        },
        { type: 'lnTo', x: 'hc', y: 'y4' },
        { type: 'arcTo', wR: 'wd2', hR: 'y1', stAng: '0', swAng: 'cd4' },
      ],
    },
  ],
  cxnLst: [
    { x: 'l', y: 't', ang: 'cd4' },
    { x: 'r', y: 'y3', ang: 'cd2' },
    { x: 'l', y: 'b', ang: '3cd4' },
  ],
  rect: { l: 'l', t: 'it', r: 'ir', b: 'ib' },
});

// ---------------------------------------------------------------------------
// straightConnector1
// ---------------------------------------------------------------------------
def({
  name: 'straightConnector1',
  avLst: [],
  gdLst: [],
  pathLst: [
    {
      commands: [
        { type: 'moveTo', x: 'l', y: 't' },
        { type: 'lnTo', x: 'r', y: 'b' },
      ],
    },
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/** Get a preset geometry definition by name. */
export function getPresetGeometry(name: string): PresetGeometryDef | undefined {
  return PRESETS.get(name);
}

/** Get all available preset geometry names. */
export function getPresetGeometryNames(): string[] {
  return Array.from(PRESETS.keys());
}
