import { describe, it, expect, beforeEach } from 'vitest';
import { PDFBackend, PDFGradient, parseCssColor } from '../pdf-backend.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh backend with a 792pt page (US Letter height). */
function createBackend(): PDFBackend {
  return new PDFBackend(792);
}

/**
 * Get operators from a backend, skipping the initial Y-flip transform.
 * The Y-flip is always the first operator: "1 0 0 -1 0 792 cm"
 */
function getOps(backend: PDFBackend): readonly string[] {
  const ops = backend.getOperators();
  // Skip the initial Y-flip transform
  return ops.slice(1);
}

// ---------------------------------------------------------------------------
// parseCssColor
// ---------------------------------------------------------------------------

describe('parseCssColor', () => {
  it('parses 6-digit hex colors', () => {
    const c = parseCssColor('#FF0000');
    expect(c.r).toBeCloseTo(1, 5);
    expect(c.g).toBeCloseTo(0, 5);
    expect(c.b).toBeCloseTo(0, 5);
    expect(c.a).toBeCloseTo(1, 5);
  });

  it('parses 3-digit hex colors', () => {
    const c = parseCssColor('#F00');
    expect(c.r).toBeCloseTo(1, 5);
    expect(c.g).toBeCloseTo(0, 5);
    expect(c.b).toBeCloseTo(0, 5);
  });

  it('parses 8-digit hex colors with alpha', () => {
    const c = parseCssColor('#FF000080');
    expect(c.r).toBeCloseTo(1, 5);
    expect(c.g).toBeCloseTo(0, 5);
    expect(c.b).toBeCloseTo(0, 5);
    expect(c.a).toBeCloseTo(128 / 255, 2);
  });

  it('parses rgb() strings', () => {
    const c = parseCssColor('rgb(128, 64, 32)');
    expect(c.r).toBeCloseTo(128 / 255, 5);
    expect(c.g).toBeCloseTo(64 / 255, 5);
    expect(c.b).toBeCloseTo(32 / 255, 5);
    expect(c.a).toBeCloseTo(1, 5);
  });

  it('parses rgba() strings', () => {
    const c = parseCssColor('rgba(255, 0, 0, 0.5)');
    expect(c.r).toBeCloseTo(1, 5);
    expect(c.g).toBeCloseTo(0, 5);
    expect(c.b).toBeCloseTo(0, 5);
    expect(c.a).toBeCloseTo(0.5, 5);
  });

  it('parses named colors', () => {
    expect(parseCssColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseCssColor('white')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseCssColor('red')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('returns black for unparseable values', () => {
    expect(parseCssColor('not-a-color')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('handles case-insensitive input', () => {
    const upper = parseCssColor('#FF0000');
    const lower = parseCssColor('#ff0000');
    expect(upper).toEqual(lower);
  });
});

// ---------------------------------------------------------------------------
// Constructor / Y-flip
// ---------------------------------------------------------------------------

describe('PDFBackend constructor', () => {
  it('emits Y-flip transform as the first operator', () => {
    const backend = new PDFBackend(792);
    const ops = backend.getOperators();
    expect(ops[0]).toBe('1 0 0 -1 0 792 cm');
  });

  it('uses the provided page height for the flip', () => {
    const backend = new PDFBackend(1000);
    const ops = backend.getOperators();
    expect(ops[0]).toBe('1 0 0 -1 0 1000 cm');
  });
});

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

describe('save/restore', () => {
  it('emits q and Q operators', () => {
    const b = createBackend();
    b.save();
    b.restore();
    const ops = getOps(b);
    expect(ops).toEqual(['q', 'Q']);
  });

  it('saves and restores fillStyle', () => {
    const b = createBackend();
    b.fillStyle = '#FF0000';
    b.save();
    b.fillStyle = '#00FF00';
    b.restore();
    expect(b.fillStyle).toBe('#FF0000');
  });

  it('saves and restores lineWidth', () => {
    const b = createBackend();
    b.lineWidth = 5;
    b.save();
    b.lineWidth = 10;
    b.restore();
    expect(b.lineWidth).toBe(5);
  });

  it('saves and restores font', () => {
    const b = createBackend();
    b.font = '12px Arial';
    b.save();
    b.font = '24px Times';
    expect(b.font).toBe('24px Times');
    b.restore();
    expect(b.font).toBe('12px Arial');
  });

  it('handles nested save/restore', () => {
    const b = createBackend();
    b.fillStyle = 'red';
    b.save();
    b.fillStyle = 'green';
    b.save();
    b.fillStyle = 'blue';
    expect(b.fillStyle).toBe('blue');
    b.restore();
    expect(b.fillStyle).toBe('green');
    b.restore();
    expect(b.fillStyle).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// Transform operations
// ---------------------------------------------------------------------------

describe('transforms', () => {
  it('translate emits correct cm operator', () => {
    const b = createBackend();
    b.translate(100, 200);
    const ops = getOps(b);
    expect(ops).toEqual(['1 0 0 1 100 200 cm']);
  });

  it('scale emits correct cm operator', () => {
    const b = createBackend();
    b.scale(2, 3);
    const ops = getOps(b);
    expect(ops).toEqual(['2 0 0 3 0 0 cm']);
  });

  it('rotate emits correct cm operator', () => {
    const b = createBackend();
    b.rotate(Math.PI / 2); // 90 degrees
    const ops = getOps(b);
    expect(ops.length).toBe(1);
    // cos(PI/2) ~ 0, sin(PI/2) ~ 1
    const parts = ops[0].split(' ');
    expect(parts[6]).toBe('cm');
    expect(parseFloat(parts[0])).toBeCloseTo(0, 5);
    expect(parseFloat(parts[1])).toBeCloseTo(1, 5);
    expect(parseFloat(parts[2])).toBeCloseTo(-1, 5);
    expect(parseFloat(parts[3])).toBeCloseTo(0, 5);
    expect(parts[4]).toBe('0');
    expect(parts[5]).toBe('0');
  });

  it('transform emits raw cm operator', () => {
    const b = createBackend();
    b.transform(1, 2, 3, 4, 5, 6);
    const ops = getOps(b);
    expect(ops).toEqual(['1 2 3 4 5 6 cm']);
  });

  it('setTransform emits cm operator', () => {
    const b = createBackend();
    b.setTransform(2, 0, 0, 2, 10, 20);
    const ops = getOps(b);
    expect(ops).toEqual(['2 0 0 2 10 20 cm']);
  });
});

// ---------------------------------------------------------------------------
// Path construction
// ---------------------------------------------------------------------------

describe('path operations', () => {
  it('moveTo emits m operator', () => {
    const b = createBackend();
    b.moveTo(10, 20);
    expect(getOps(b)).toEqual(['10 20 m']);
  });

  it('lineTo emits l operator', () => {
    const b = createBackend();
    b.lineTo(30, 40);
    expect(getOps(b)).toEqual(['30 40 l']);
  });

  it('bezierCurveTo emits c operator', () => {
    const b = createBackend();
    b.bezierCurveTo(10, 20, 30, 40, 50, 60);
    expect(getOps(b)).toEqual(['10 20 30 40 50 60 c']);
  });

  it('closePath emits h operator', () => {
    const b = createBackend();
    b.closePath();
    expect(getOps(b)).toEqual(['h']);
  });

  it('rect emits re operator', () => {
    const b = createBackend();
    b.rect(10, 20, 100, 50);
    expect(getOps(b)).toEqual(['10 20 100 50 re']);
  });

  it('beginPath clears internal path state', () => {
    const b = createBackend();
    b.moveTo(10, 20);
    b.beginPath();
    // beginPath does not emit an operator (PDF has no equivalent)
    // but after beginPath, we can start a new path
    b.moveTo(30, 40);
    const ops = getOps(b);
    // Should have: moveTo(10,20), moveTo(30,40)
    expect(ops).toEqual(['10 20 m', '30 40 m']);
  });

  it('quadraticCurveTo emits c operator (cubic approximation)', () => {
    const b = createBackend();
    b.quadraticCurveTo(10, 20, 30, 40);
    const ops = getOps(b);
    expect(ops.length).toBe(1);
    expect(ops[0]).toMatch(/c$/);
  });
});

// ---------------------------------------------------------------------------
// Painting operations
// ---------------------------------------------------------------------------

describe('fill/stroke', () => {
  it('fill() emits fill color + f operator', () => {
    const b = createBackend();
    b.fillStyle = '#FF0000';
    b.beginPath();
    b.rect(0, 0, 100, 50);
    b.fill();
    const ops = getOps(b);
    // Should include rg (fill color) and f
    expect(ops).toContain('1 0 0 rg');
    expect(ops[ops.length - 1]).toBe('f');
  });

  it('fill with evenodd emits f* operator', () => {
    const b = createBackend();
    b.beginPath();
    b.rect(0, 0, 100, 50);
    b.fill('evenodd');
    const ops = getOps(b);
    expect(ops[ops.length - 1]).toBe('f*');
  });

  it('stroke() emits stroke color + line width + S operator', () => {
    const b = createBackend();
    b.strokeStyle = '#0000FF';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(0, 0);
    b.lineTo(100, 100);
    b.stroke();
    const ops = getOps(b);
    expect(ops).toContain('0 0 1 RG');
    expect(ops).toContain('2 w');
    expect(ops[ops.length - 1]).toBe('S');
  });

  it('fill throws for Path2D argument', () => {
    const b = createBackend();
    expect(() => b.fill({} as any)).toThrow('Path2D is not supported');
  });

  it('stroke throws for Path2D argument', () => {
    const b = createBackend();
    expect(() => b.stroke({} as any)).toThrow('Path2D is not supported');
  });
});

describe('fillRect', () => {
  it('emits re + f operators', () => {
    const b = createBackend();
    b.fillStyle = '#00FF00';
    b.fillRect(10, 20, 100, 50);
    const ops = getOps(b);
    expect(ops).toContain('0 1 0 rg');
    expect(ops).toContain('10 20 100 50 re');
    expect(ops[ops.length - 1]).toBe('f');
  });
});

describe('strokeRect', () => {
  it('emits re + S operators', () => {
    const b = createBackend();
    b.strokeStyle = '#FF0000';
    b.lineWidth = 3;
    b.strokeRect(5, 10, 200, 100);
    const ops = getOps(b);
    expect(ops).toContain('1 0 0 RG');
    expect(ops).toContain('3 w');
    expect(ops).toContain('5 10 200 100 re');
    expect(ops[ops.length - 1]).toBe('S');
  });
});

describe('clearRect', () => {
  it('emits save + white fill + rect + f + restore', () => {
    const b = createBackend();
    b.clearRect(0, 0, 100, 100);
    const ops = getOps(b);
    expect(ops[0]).toBe('q');
    expect(ops).toContain('1 1 1 rg');
    expect(ops).toContain('0 0 100 100 re');
    expect(ops).toContain('f');
    expect(ops[ops.length - 1]).toBe('Q');
  });
});

// ---------------------------------------------------------------------------
// Clip
// ---------------------------------------------------------------------------

describe('clip', () => {
  it('emits W n for nonzero winding', () => {
    const b = createBackend();
    b.rect(0, 0, 100, 100);
    b.clip();
    const ops = getOps(b);
    expect(ops).toContain('W');
    expect(ops).toContain('n');
  });

  it('emits W* n for evenodd', () => {
    const b = createBackend();
    b.rect(0, 0, 100, 100);
    b.clip('evenodd');
    const ops = getOps(b);
    expect(ops).toContain('W*');
    expect(ops).toContain('n');
  });
});

// ---------------------------------------------------------------------------
// Style properties
// ---------------------------------------------------------------------------

describe('fillStyle / strokeStyle', () => {
  it('stores and retrieves string fill style', () => {
    const b = createBackend();
    b.fillStyle = '#FF0000';
    expect(b.fillStyle).toBe('#FF0000');
  });

  it('stores and retrieves string stroke style', () => {
    const b = createBackend();
    b.strokeStyle = '#0000FF';
    expect(b.strokeStyle).toBe('#0000FF');
  });

  it('handles gradient fill style', () => {
    const b = createBackend();
    const grad = b.createLinearGradient(0, 0, 100, 0);
    grad.addColorStop(0, '#FF0000');
    grad.addColorStop(1, '#0000FF');
    b.fillStyle = grad;
    // fillStyle getter returns the gradient object (as CanvasGradient)
    expect(b.fillStyle).not.toBeNull();
  });

  it('emits pattern reference for gradient fill with 2+ stops', () => {
    const b = createBackend();
    const grad = b.createLinearGradient(0, 0, 100, 0);
    grad.addColorStop(0, '#FF0000');
    grad.addColorStop(1, '#0000FF');
    b.fillStyle = grad;
    b.fillRect(0, 0, 100, 50);
    const ops = getOps(b);
    // Should emit pattern color space and pattern name
    expect(ops).toContain('/Pattern cs /P1 scn');
    // Gradient shading should be recorded
    const shadings = b.getGradientShadings();
    expect(shadings).toHaveLength(1);
    expect(shadings[0].patternName).toBe('P1');
    expect(shadings[0].type).toBe('linear');
    expect(shadings[0].stops).toHaveLength(2);
  });

  it('falls back to first stop color for gradient with single stop', () => {
    const b = createBackend();
    const grad = b.createLinearGradient(0, 0, 100, 0);
    grad.addColorStop(0, '#FF0000');
    b.fillStyle = grad;
    b.fillRect(0, 0, 100, 50);
    const ops = getOps(b);
    // Single stop = fallback to solid color approximation
    expect(ops).toContain('1 0 0 rg');
  });
});

describe('lineWidth', () => {
  it('stores and retrieves line width', () => {
    const b = createBackend();
    b.lineWidth = 5;
    expect(b.lineWidth).toBe(5);
  });
});

describe('lineCap', () => {
  it('emits correct J operator for butt', () => {
    const b = createBackend();
    b.lineCap = 'butt';
    expect(getOps(b)).toEqual(['0 J']);
    expect(b.lineCap).toBe('butt');
  });

  it('emits correct J operator for round', () => {
    const b = createBackend();
    b.lineCap = 'round';
    expect(getOps(b)).toEqual(['1 J']);
  });

  it('emits correct J operator for square', () => {
    const b = createBackend();
    b.lineCap = 'square';
    expect(getOps(b)).toEqual(['2 J']);
  });
});

describe('lineJoin', () => {
  it('emits correct j operator for miter', () => {
    const b = createBackend();
    b.lineJoin = 'miter';
    expect(getOps(b)).toEqual(['0 j']);
    expect(b.lineJoin).toBe('miter');
  });

  it('emits correct j operator for round', () => {
    const b = createBackend();
    b.lineJoin = 'round';
    expect(getOps(b)).toEqual(['1 j']);
  });

  it('emits correct j operator for bevel', () => {
    const b = createBackend();
    b.lineJoin = 'bevel';
    expect(getOps(b)).toEqual(['2 j']);
  });
});

describe('miterLimit', () => {
  it('emits M operator', () => {
    const b = createBackend();
    b.miterLimit = 4;
    expect(getOps(b)).toEqual(['4 M']);
    expect(b.miterLimit).toBe(4);
  });
});

describe('setLineDash / getLineDash', () => {
  it('emits d operator with dash array', () => {
    const b = createBackend();
    b.setLineDash([5, 3]);
    expect(getOps(b)).toEqual(['[5 3] 0 d']);
  });

  it('returns the dash array via getLineDash', () => {
    const b = createBackend();
    b.setLineDash([10, 5, 2]);
    expect(b.getLineDash()).toEqual([10, 5, 2]);
  });

  it('emits d operator with dash offset', () => {
    const b = createBackend();
    b.setLineDash([5, 3]);
    b.lineDashOffset = 2;
    const ops = getOps(b);
    expect(ops).toContain('[5 3] 2 d');
    expect(b.lineDashOffset).toBe(2);
  });

  it('handles empty dash array (solid line)', () => {
    const b = createBackend();
    b.setLineDash([]);
    expect(getOps(b)).toEqual(['[] 0 d']);
  });
});

// ---------------------------------------------------------------------------
// Global alpha / composite operation (stored but not fully emitted)
// ---------------------------------------------------------------------------

describe('globalAlpha', () => {
  it('stores and retrieves global alpha', () => {
    const b = createBackend();
    b.globalAlpha = 0.5;
    expect(b.globalAlpha).toBe(0.5);
  });
});

describe('globalCompositeOperation', () => {
  it('stores and retrieves composite operation', () => {
    const b = createBackend();
    b.globalCompositeOperation = 'multiply';
    expect(b.globalCompositeOperation).toBe('multiply');
  });
});

// ---------------------------------------------------------------------------
// Shadow properties (stored, not emitted)
// ---------------------------------------------------------------------------

describe('shadow properties', () => {
  it('stores and retrieves shadow color', () => {
    const b = createBackend();
    b.shadowColor = 'rgba(0, 0, 0, 0.5)';
    expect(b.shadowColor).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('stores and retrieves shadow blur', () => {
    const b = createBackend();
    b.shadowBlur = 10;
    expect(b.shadowBlur).toBe(10);
  });

  it('stores and retrieves shadow offsets', () => {
    const b = createBackend();
    b.shadowOffsetX = 5;
    b.shadowOffsetY = 3;
    expect(b.shadowOffsetX).toBe(5);
    expect(b.shadowOffsetY).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Text properties
// ---------------------------------------------------------------------------

describe('text properties', () => {
  it('stores and retrieves font', () => {
    const b = createBackend();
    b.font = 'bold 16px Arial';
    expect(b.font).toBe('bold 16px Arial');
  });

  it('stores and retrieves textAlign', () => {
    const b = createBackend();
    b.textAlign = 'center';
    expect(b.textAlign).toBe('center');
  });

  it('stores and retrieves textBaseline', () => {
    const b = createBackend();
    b.textBaseline = 'middle';
    expect(b.textBaseline).toBe('middle');
  });

  it('stores and retrieves direction', () => {
    const b = createBackend();
    b.direction = 'rtl';
    expect(b.direction).toBe('rtl');
  });

  it('stores and retrieves letterSpacing', () => {
    const b = createBackend();
    b.letterSpacing = '2px';
    expect(b.letterSpacing).toBe('2px');
  });
});

// ---------------------------------------------------------------------------
// fillText / strokeText
// ---------------------------------------------------------------------------

describe('fillText', () => {
  it('emits BT/ET block with Tf, Td, Tj operators', () => {
    const b = createBackend();
    b.fillStyle = '#000000';
    b.font = '12px Arial';
    b.fillText('Hello', 10, 20);
    const ops = getOps(b);
    expect(ops[0]).toBe('BT');
    expect(ops).toContain('/Arial 12 Tf');
    expect(ops).toContain('10 20 Td');
    // Hex encoding of "Hello"
    expect(ops).toContain('<00480065006C006C006F> Tj');
    expect(ops[ops.length - 1]).toBe('ET');
  });

  it('sets fill color in text block', () => {
    const b = createBackend();
    b.fillStyle = '#FF0000';
    b.font = '16px Helvetica';
    b.fillText('A', 0, 0);
    const ops = getOps(b);
    expect(ops).toContain('1 0 0 rg');
  });
});

describe('strokeText', () => {
  it('emits BT/ET block with stroke rendering mode', () => {
    const b = createBackend();
    b.strokeStyle = '#0000FF';
    b.font = '14px Times';
    b.strokeText('Test', 5, 15);
    const ops = getOps(b);
    expect(ops[0]).toBe('BT');
    expect(ops).toContain('0 0 1 RG');
    expect(ops).toContain('2 Tr'); // Stroke text rendering mode
    expect(ops).toContain('/Times 14 Tf');
    expect(ops).toContain('0 Tr'); // Reset to fill mode
    expect(ops[ops.length - 1]).toBe('ET');
  });
});

// ---------------------------------------------------------------------------
// measureText
// ---------------------------------------------------------------------------

describe('measureText', () => {
  it('returns a TextMetrics-like object with a width', () => {
    const b = createBackend();
    b.font = '10px sans-serif';
    const metrics = b.measureText('Hello');
    expect(metrics.width).toBeGreaterThan(0);
    expect(typeof metrics.actualBoundingBoxAscent).toBe('number');
  });

  it('uses provided text measurer when available', () => {
    const measurer = (
      text: string,
      _family: string,
      _size: number,
      _bold: boolean,
      _italic: boolean
    ) => text.length * 10;
    const b = new PDFBackend(792, measurer);
    b.font = '12px Arial';
    const metrics = b.measureText('Hello');
    expect(metrics.width).toBe(50); // 5 chars * 10
  });

  it('falls back to heuristic when measurer returns undefined', () => {
    const measurer = () => undefined;
    const b = new PDFBackend(792, measurer);
    b.font = '10px Arial';
    const metrics = b.measureText('Hello');
    // Heuristic: 0.5 * fontSize * length = 0.5 * 10 * 5 = 25
    expect(metrics.width).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// drawImage
// ---------------------------------------------------------------------------

describe('drawImage', () => {
  it('emits q/Q with translate and Do for simple drawImage', () => {
    const b = createBackend();
    b.drawImage({} as any, 10, 20, 100, 50);
    const ops = getOps(b);
    expect(ops[0]).toBe('q');
    expect(ops).toContain('1 0 0 1 10 20 cm');
    expect(ops).toContain('100 0 0 50 0 0 cm');
    expect(ops).toContain('/ImgPlaceholder Do');
    expect(ops[ops.length - 1]).toBe('Q');
  });
});

// ---------------------------------------------------------------------------
// Gradient factories
// ---------------------------------------------------------------------------

describe('createLinearGradient', () => {
  it('returns a gradient-like object', () => {
    const b = createBackend();
    const grad = b.createLinearGradient(0, 0, 100, 0);
    expect(grad).not.toBeNull();
    expect(typeof grad.addColorStop).toBe('function');
  });
});

describe('createRadialGradient', () => {
  it('returns a gradient-like object', () => {
    const b = createBackend();
    const grad = b.createRadialGradient(50, 50, 0, 50, 50, 100);
    expect(grad).not.toBeNull();
    expect(typeof grad.addColorStop).toBe('function');
  });
});

describe('createPattern', () => {
  it('returns null (not yet implemented)', () => {
    const b = createBackend();
    const pattern = b.createPattern({} as any, 'repeat');
    expect(pattern).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PDFGradient
// ---------------------------------------------------------------------------

describe('PDFGradient', () => {
  it('records color stops in order', () => {
    const g = new PDFGradient('linear', [0, 0, 100, 0]);
    g.addColorStop(1, '#0000FF');
    g.addColorStop(0, '#FF0000');
    g.addColorStop(0.5, '#00FF00');
    expect(g.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
  });

  it('getApproximateColor returns first stop', () => {
    const g = new PDFGradient('linear', [0, 0, 100, 0]);
    g.addColorStop(0, '#FF0000');
    g.addColorStop(1, '#0000FF');
    expect(g.getApproximateColor()).toBe('#FF0000');
  });

  it('getApproximateColor returns black when no stops', () => {
    const g = new PDFGradient('linear', [0, 0, 100, 0]);
    expect(g.getApproximateColor()).toBe('#000000');
  });
});

// ---------------------------------------------------------------------------
// toString / toBytes
// ---------------------------------------------------------------------------

describe('output methods', () => {
  it('toString joins operators with newlines', () => {
    const b = createBackend();
    b.save();
    b.restore();
    const str = b.toString();
    expect(str).toContain('q\nQ');
  });

  it('toBytes returns UTF-8 encoded bytes', () => {
    const b = createBackend();
    b.save();
    b.restore();
    const bytes = b.toBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    // Decode back and verify
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('q\nQ');
  });
});

// ---------------------------------------------------------------------------
// Coordinate system integration
// ---------------------------------------------------------------------------

describe('coordinate system', () => {
  it('Y-flip + translate produces correct PDF coordinates', () => {
    const b = new PDFBackend(792);
    b.translate(100, 50);
    // After Y-flip (1 0 0 -1 0 792), translate(100, 50) should be:
    // 1 0 0 1 100 50 cm
    const ops = b.getOperators();
    expect(ops[0]).toBe('1 0 0 -1 0 792 cm');
    expect(ops[1]).toBe('1 0 0 1 100 50 cm');
  });

  it('fillRect at origin fills the top-left corner in Canvas coordinates', () => {
    const b = new PDFBackend(792);
    b.fillStyle = '#FF0000';
    b.fillRect(0, 0, 100, 50);
    const ops = b.getOperators();
    // Y-flip makes y=0 the top, so fillRect(0,0,100,50) should work correctly
    expect(ops).toContain('0 0 100 50 re');
    expect(ops).toContain('f');
  });
});

// ---------------------------------------------------------------------------
// Arc operations
// ---------------------------------------------------------------------------

describe('arc', () => {
  it('emits move + bezier curve operators for a full circle', () => {
    const b = createBackend();
    b.arc(50, 50, 25, 0, Math.PI * 2);
    const ops = getOps(b);
    // Should start with a moveTo
    expect(ops[0]).toMatch(/m$/);
    // Should have bezier curves
    const bezierOps = ops.filter((op) => op.endsWith(' c'));
    expect(bezierOps.length).toBeGreaterThanOrEqual(4); // Full circle needs 4 segments
  });

  it('emits correct start point for arc at 0 radians', () => {
    const b = createBackend();
    b.arc(100, 100, 50, 0, Math.PI / 2);
    const ops = getOps(b);
    // Start point: (100 + 50*cos(0), 100 + 50*sin(0)) = (150, 100)
    expect(ops[0]).toBe('150 100 m');
  });
});

// ---------------------------------------------------------------------------
// Ellipse
// ---------------------------------------------------------------------------

describe('ellipse', () => {
  it('emits q/Q block with transform for elliptical arc', () => {
    const b = createBackend();
    b.ellipse(100, 100, 50, 30, 0, 0, Math.PI * 2);
    const ops = getOps(b);
    expect(ops[0]).toBe('q');
    expect(ops).toContain('1 0 0 1 100 100 cm'); // translate
    expect(ops).toContain('50 0 0 30 0 0 cm'); // scale
    expect(ops[ops.length - 1]).toBe('Q');
  });
});

// ---------------------------------------------------------------------------
// Complex drawing sequence
// ---------------------------------------------------------------------------

describe('complex drawing sequences', () => {
  it('draws a filled and stroked rectangle', () => {
    const b = createBackend();
    b.save();
    b.fillStyle = '#FF0000';
    b.strokeStyle = '#000000';
    b.lineWidth = 2;
    b.fillRect(10, 20, 100, 50);
    b.strokeRect(10, 20, 100, 50);
    b.restore();
    const ops = getOps(b);
    expect(ops[0]).toBe('q');
    // Fill operations
    expect(ops).toContain('1 0 0 rg');
    expect(ops).toContain('10 20 100 50 re');
    expect(ops).toContain('f');
    // Stroke operations
    expect(ops).toContain('0 0 0 RG');
    expect(ops).toContain('2 w');
    expect(ops).toContain('S');
    expect(ops[ops.length - 1]).toBe('Q');
  });

  it('draws a triangle path', () => {
    const b = createBackend();
    b.fillStyle = '#00FF00';
    b.beginPath();
    b.moveTo(50, 0);
    b.lineTo(100, 100);
    b.lineTo(0, 100);
    b.closePath();
    b.fill();
    const ops = getOps(b);
    expect(ops).toContain('50 0 m');
    expect(ops).toContain('100 100 l');
    expect(ops).toContain('0 100 l');
    expect(ops).toContain('h');
    expect(ops).toContain('f');
  });

  it('clips and fills', () => {
    const b = createBackend();
    b.save();
    b.beginPath();
    b.rect(10, 10, 80, 80);
    b.clip();
    b.fillStyle = '#0000FF';
    b.fillRect(0, 0, 100, 100);
    b.restore();
    const ops = getOps(b);
    expect(ops[0]).toBe('q');
    expect(ops).toContain('W');
    expect(ops).toContain('n');
    expect(ops).toContain('0 0 1 rg');
    expect(ops).toContain('f');
    expect(ops[ops.length - 1]).toBe('Q');
  });
});

// ---------------------------------------------------------------------------
// Color parsing edge cases
// ---------------------------------------------------------------------------

describe('color parsing in context', () => {
  it('handles CSS named color for fill', () => {
    const b = createBackend();
    b.fillStyle = 'red';
    b.fillRect(0, 0, 10, 10);
    const ops = getOps(b);
    expect(ops).toContain('1 0 0 rg');
  });

  it('handles rgba color for stroke', () => {
    const b = createBackend();
    b.strokeStyle = 'rgba(0, 128, 255, 0.5)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(0, 0);
    b.lineTo(100, 100);
    b.stroke();
    const ops = getOps(b);
    // 128/255 ~ 0.5019...
    const rgOp = ops.find((op) => op.endsWith(' RG'));
    expect(rgOp).toBeDefined();
    const parts = rgOp!.split(' ');
    expect(parseFloat(parts[0])).toBeCloseTo(0, 1);
    expect(parseFloat(parts[1])).toBeCloseTo(128 / 255, 2);
    expect(parseFloat(parts[2])).toBeCloseTo(1, 1);
  });
});

// ---------------------------------------------------------------------------
// Font parsing
// ---------------------------------------------------------------------------

describe('font string parsing in fillText', () => {
  it('parses simple font string', () => {
    const b = createBackend();
    b.font = '16px Helvetica';
    b.fillText('A', 0, 0);
    const ops = getOps(b);
    expect(ops).toContain('/Helvetica 16 Tf');
  });

  it('parses bold font string', () => {
    const b = createBackend();
    b.font = 'bold 20px Arial';
    b.fillText('B', 0, 0);
    const ops = getOps(b);
    expect(ops).toContain('/Arial 20 Tf');
  });

  it('parses font with quoted family name', () => {
    const b = createBackend();
    b.font = '12px "Times New Roman"';
    b.fillText('C', 0, 0);
    const ops = getOps(b);
    expect(ops).toContain('/TimesNewRoman 12 Tf');
  });
});
