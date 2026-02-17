import { describe, it, expect } from 'vitest';
import { createGuideContext, evaluateFormula, evaluateGuides } from '../shape-guide-eval.js';

// ═══════════════════════════════════════════════════════════════════════════
// Helper: create a context for a 1000x800 shape (easy math)
// ═══════════════════════════════════════════════════════════════════════════

function ctx(w = 1000, h = 800) {
  return createGuideContext(w, h);
}

describe('evaluateFormula', () => {
  // -----------------------------------------------------------------------
  // val
  // -----------------------------------------------------------------------
  describe('val', () => {
    it('returns a literal number', () => {
      expect(evaluateFormula('val 42', ctx())).toBe(42);
    });

    it('resolves a variable reference', () => {
      expect(evaluateFormula('val w', ctx())).toBe(1000);
    });

    it('resolves zero', () => {
      expect(evaluateFormula('val 0', ctx())).toBe(0);
    });

    it('resolves a negative number', () => {
      expect(evaluateFormula('val -100', ctx())).toBe(-100);
    });
  });

  // -----------------------------------------------------------------------
  // */ (multiply-divide)
  // -----------------------------------------------------------------------
  describe('*/', () => {
    it('computes x * y / z', () => {
      expect(evaluateFormula('*/ 100 3 4', ctx())).toBe(75);
    });

    it('returns 0 on division by zero', () => {
      expect(evaluateFormula('*/ 100 3 0', ctx())).toBe(0);
    });

    it('works with variable references', () => {
      // w * 1 / 2 = 1000 / 2 = 500
      expect(evaluateFormula('*/ w 1 2', ctx())).toBe(500);
    });

    it('handles large intermediate values', () => {
      // 100000 * 16667 / 100000 = 16667
      expect(evaluateFormula('*/ 100000 16667 100000', ctx())).toBeCloseTo(16667, 5);
    });
  });

  // -----------------------------------------------------------------------
  // +- (add-subtract)
  // -----------------------------------------------------------------------
  describe('+-', () => {
    it('computes x + y - z', () => {
      expect(evaluateFormula('+- 10 5 3', ctx())).toBe(12);
    });

    it('handles all zeros', () => {
      expect(evaluateFormula('+- 0 0 0', ctx())).toBe(0);
    });

    it('works with variable references', () => {
      // r + 0 - wd2 = 1000 + 0 - 500 = 500
      expect(evaluateFormula('+- r 0 wd2', ctx())).toBe(500);
    });

    it('produces negative result', () => {
      expect(evaluateFormula('+- 3 0 10', ctx())).toBe(-7);
    });
  });

  // -----------------------------------------------------------------------
  // +/ (add-divide)
  // -----------------------------------------------------------------------
  describe('+/', () => {
    it('computes (x + y) / z', () => {
      expect(evaluateFormula('+/ 10 6 2', ctx())).toBe(8);
    });

    it('returns 0 on division by zero', () => {
      expect(evaluateFormula('+/ 10 6 0', ctx())).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // ?: (conditional)
  // -----------------------------------------------------------------------
  describe('?:', () => {
    it('returns y when x > 0', () => {
      expect(evaluateFormula('?: 1 100 200', ctx())).toBe(100);
    });

    it('returns z when x <= 0', () => {
      expect(evaluateFormula('?: -1 100 200', ctx())).toBe(200);
    });

    it('returns z when x == 0', () => {
      expect(evaluateFormula('?: 0 100 200', ctx())).toBe(200);
    });

    it('works with variable references', () => {
      // w > 0 is true, so should return first arg (5)
      expect(evaluateFormula('?: w 5 10', ctx())).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // abs
  // -----------------------------------------------------------------------
  describe('abs', () => {
    it('returns absolute value of negative', () => {
      expect(evaluateFormula('abs -5', ctx())).toBe(5);
    });

    it('returns absolute value of positive', () => {
      expect(evaluateFormula('abs 5', ctx())).toBe(5);
    });

    it('returns 0 for 0', () => {
      expect(evaluateFormula('abs 0', ctx())).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // cos
  // -----------------------------------------------------------------------
  describe('cos', () => {
    it('cos(90 degrees) * 100 = ~0', () => {
      // cd4 = 5400000 = 90 degrees
      const result = evaluateFormula('cos 100 cd4', ctx());
      expect(result).toBeCloseTo(0, 5);
    });

    it('cos(0 degrees) * 100 = 100', () => {
      const result = evaluateFormula('cos 100 0', ctx());
      expect(result).toBeCloseTo(100, 5);
    });

    it('cos(180 degrees) * 100 = -100', () => {
      const result = evaluateFormula('cos 100 cd2', ctx());
      expect(result).toBeCloseTo(-100, 5);
    });

    it('cos(45 degrees) * 100 = ~70.71', () => {
      const result = evaluateFormula('cos 100 cd8', ctx());
      expect(result).toBeCloseTo(70.710678, 3);
    });
  });

  // -----------------------------------------------------------------------
  // sin
  // -----------------------------------------------------------------------
  describe('sin', () => {
    it('sin(90 degrees) * 100 = 100', () => {
      const result = evaluateFormula('sin 100 cd4', ctx());
      expect(result).toBeCloseTo(100, 5);
    });

    it('sin(0 degrees) * 100 = 0', () => {
      const result = evaluateFormula('sin 100 0', ctx());
      expect(result).toBeCloseTo(0, 5);
    });

    it('sin(180 degrees) * 100 = ~0', () => {
      const result = evaluateFormula('sin 100 cd2', ctx());
      expect(result).toBeCloseTo(0, 5);
    });

    it('sin(45 degrees) * 100 = ~70.71', () => {
      const result = evaluateFormula('sin 100 cd8', ctx());
      expect(result).toBeCloseTo(70.710678, 3);
    });
  });

  // -----------------------------------------------------------------------
  // at2
  // -----------------------------------------------------------------------
  describe('at2', () => {
    it('atan2(1, 0) = 90 degrees in OOXML units', () => {
      // at2 x y -> atan2(y, x)
      // at2 0 1 -> atan2(1, 0) = 90 degrees = 5400000
      const result = evaluateFormula('at2 0 1', ctx());
      expect(result).toBeCloseTo(5400000, 0);
    });

    it('atan2(0, 1) = 0 degrees', () => {
      const result = evaluateFormula('at2 1 0', ctx());
      expect(result).toBeCloseTo(0, 0);
    });

    it('atan2(1, 1) = 45 degrees', () => {
      const result = evaluateFormula('at2 1 1', ctx());
      expect(result).toBeCloseTo(2700000, 0);
    });

    it('atan2(-1, 0) = -90 degrees', () => {
      const result = evaluateFormula('at2 0 -1', ctx());
      expect(result).toBeCloseTo(-5400000, 0);
    });
  });

  // -----------------------------------------------------------------------
  // cat2 (cosine arctan)
  // -----------------------------------------------------------------------
  describe('cat2', () => {
    it('x * cos(atan2(z, y))', () => {
      // cat2 100 1 0 -> 100 * cos(atan2(0, 1)) = 100 * cos(0) = 100
      const result = evaluateFormula('cat2 100 1 0', ctx());
      expect(result).toBeCloseTo(100, 5);
    });

    it('x * cos(atan2(1, 1)) = x * cos(45deg)', () => {
      const result = evaluateFormula('cat2 100 1 1', ctx());
      expect(result).toBeCloseTo(70.710678, 3);
    });
  });

  // -----------------------------------------------------------------------
  // sat2 (sine arctan)
  // -----------------------------------------------------------------------
  describe('sat2', () => {
    it('x * sin(atan2(z, y))', () => {
      // sat2 100 1 0 -> 100 * sin(atan2(0, 1)) = 100 * sin(0) = 0
      const result = evaluateFormula('sat2 100 1 0', ctx());
      expect(result).toBeCloseTo(0, 5);
    });

    it('x * sin(atan2(1, 1)) = x * sin(45deg)', () => {
      const result = evaluateFormula('sat2 100 1 1', ctx());
      expect(result).toBeCloseTo(70.710678, 3);
    });
  });

  // -----------------------------------------------------------------------
  // max / min
  // -----------------------------------------------------------------------
  describe('max', () => {
    it('returns the larger of two values', () => {
      expect(evaluateFormula('max 10 20', ctx())).toBe(20);
    });

    it('handles equal values', () => {
      expect(evaluateFormula('max 10 10', ctx())).toBe(10);
    });

    it('handles negative values', () => {
      expect(evaluateFormula('max -5 -3', ctx())).toBe(-3);
    });
  });

  describe('min', () => {
    it('returns the smaller of two values', () => {
      expect(evaluateFormula('min 10 20', ctx())).toBe(10);
    });

    it('handles equal values', () => {
      expect(evaluateFormula('min 10 10', ctx())).toBe(10);
    });

    it('handles negative values', () => {
      expect(evaluateFormula('min -5 -3', ctx())).toBe(-5);
    });
  });

  // -----------------------------------------------------------------------
  // mod (vector magnitude)
  // -----------------------------------------------------------------------
  describe('mod', () => {
    it('sqrt(3^2 + 4^2 + 0^2) = 5', () => {
      expect(evaluateFormula('mod 3 4 0', ctx())).toBe(5);
    });

    it('sqrt(1^2 + 1^2 + 1^2) = sqrt(3)', () => {
      expect(evaluateFormula('mod 1 1 1', ctx())).toBeCloseTo(Math.sqrt(3), 10);
    });

    it('single non-zero arg', () => {
      expect(evaluateFormula('mod 7 0 0', ctx())).toBe(7);
    });
  });

  // -----------------------------------------------------------------------
  // pin (clamp)
  // -----------------------------------------------------------------------
  describe('pin', () => {
    it('clamps value below minimum', () => {
      // pin 10 5 20 -> y=5 < x=10, so return 10
      expect(evaluateFormula('pin 10 5 20', ctx())).toBe(10);
    });

    it('passes through value in range', () => {
      // pin 10 15 20 -> 10 <= 15 <= 20, so return 15
      expect(evaluateFormula('pin 10 15 20', ctx())).toBe(15);
    });

    it('clamps value above maximum', () => {
      // pin 10 25 20 -> y=25 > z=20, so return 20
      expect(evaluateFormula('pin 10 25 20', ctx())).toBe(20);
    });

    it('handles equal bounds', () => {
      expect(evaluateFormula('pin 10 10 10', ctx())).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // sqrt
  // -----------------------------------------------------------------------
  describe('sqrt', () => {
    it('sqrt(144) = 12', () => {
      expect(evaluateFormula('sqrt 144', ctx())).toBe(12);
    });

    it('sqrt(0) = 0', () => {
      expect(evaluateFormula('sqrt 0', ctx())).toBe(0);
    });

    it('sqrt(2) = ~1.414', () => {
      expect(evaluateFormula('sqrt 2', ctx())).toBeCloseTo(1.41421356, 5);
    });

    it('sqrt of negative returns 0 (guarded)', () => {
      expect(evaluateFormula('sqrt -1', ctx())).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // tan
  // -----------------------------------------------------------------------
  describe('tan', () => {
    it('tan(45 degrees) * 100 = ~100', () => {
      const result = evaluateFormula('tan 100 cd8', ctx());
      expect(result).toBeCloseTo(100, 3);
    });

    it('tan(0 degrees) * 100 = 0', () => {
      const result = evaluateFormula('tan 100 0', ctx());
      expect(result).toBeCloseTo(0, 5);
    });
  });

  // -----------------------------------------------------------------------
  // Unknown operator
  // -----------------------------------------------------------------------
  describe('unknown operator', () => {
    it('returns 0 for unknown ops', () => {
      expect(evaluateFormula('bogus 1 2 3', ctx())).toBe(0);
    });
  });
});

describe('Built-in variables', () => {
  it('w and h equal shape dimensions', () => {
    const c = ctx(1000, 800);
    expect(c.get('w')).toBe(1000);
    expect(c.get('h')).toBe(800);
  });

  it('wd2 = w/2, hd2 = h/2', () => {
    const c = ctx(1000, 800);
    expect(c.get('wd2')).toBe(500);
    expect(c.get('hd2')).toBe(400);
  });

  it('wd3, wd4, wd5, wd6, wd8, wd10, wd12, wd32', () => {
    const c = ctx(1200, 600);
    expect(c.get('wd3')).toBe(400);
    expect(c.get('wd4')).toBe(300);
    expect(c.get('wd5')).toBe(240);
    expect(c.get('wd6')).toBe(200);
    expect(c.get('wd8')).toBe(150);
    expect(c.get('wd10')).toBe(120);
    expect(c.get('wd12')).toBe(100);
    expect(c.get('wd32')).toBe(37.5);
  });

  it('hd3, hd4, hd5, hd6, hd8', () => {
    const c = ctx(1200, 600);
    expect(c.get('hd3')).toBe(200);
    expect(c.get('hd4')).toBe(150);
    expect(c.get('hd5')).toBe(120);
    expect(c.get('hd6')).toBe(100);
    expect(c.get('hd8')).toBe(75);
  });

  it('l=0, t=0, r=w, b=h', () => {
    const c = ctx(1000, 800);
    expect(c.get('l')).toBe(0);
    expect(c.get('t')).toBe(0);
    expect(c.get('r')).toBe(1000);
    expect(c.get('b')).toBe(800);
  });

  it('hc = w/2, vc = h/2', () => {
    const c = ctx(1000, 800);
    expect(c.get('hc')).toBe(500);
    expect(c.get('vc')).toBe(400);
  });

  it('ss = min(w,h), ls = max(w,h)', () => {
    const c = ctx(1000, 800);
    expect(c.get('ss')).toBe(800);
    expect(c.get('ls')).toBe(1000);
  });

  it('ss = min(w,h) when w < h', () => {
    const c = ctx(500, 1000);
    expect(c.get('ss')).toBe(500);
    expect(c.get('ls')).toBe(1000);
  });

  it('ssd2, ssd4, ssd6, ssd8, ssd16, ssd32', () => {
    const c = ctx(1000, 800); // ss = 800
    expect(c.get('ssd2')).toBe(400);
    expect(c.get('ssd4')).toBe(200);
    expect(c.get('ssd6')).toBeCloseTo(133.333, 2);
    expect(c.get('ssd8')).toBe(100);
    expect(c.get('ssd16')).toBe(50);
    expect(c.get('ssd32')).toBe(25);
  });

  it('angle constants', () => {
    const c = ctx();
    expect(c.get('cd2')).toBe(10800000); // 180 degrees
    expect(c.get('cd4')).toBe(5400000); // 90 degrees
    expect(c.get('cd8')).toBe(2700000); // 45 degrees
    expect(c.get('3cd4')).toBe(16200000); // 270 degrees
    expect(c.get('3cd8')).toBe(8100000); // 135 degrees
    expect(c.get('5cd8')).toBe(13500000); // 225 degrees
    expect(c.get('7cd8')).toBe(18900000); // 315 degrees
  });

  it('returns 0 for unknown variables', () => {
    const c = ctx();
    expect(c.get('nonexistent')).toBe(0);
  });
});

describe('createGuideContext', () => {
  it('applies adjust value overrides', () => {
    const c = createGuideContext(1000, 800, { adj: 16667 });
    expect(c.get('adj')).toBe(16667);
    // Built-ins should still work
    expect(c.get('w')).toBe(1000);
  });

  it('override replaces built-in if same name', () => {
    const c = createGuideContext(1000, 800, { w: 999 });
    expect(c.get('w')).toBe(999);
  });
});

describe('evaluateGuides', () => {
  it('evaluates a chain of dependent guides', () => {
    const c = createGuideContext(1000, 800);
    const result = evaluateGuides(
      [
        { name: 'a', fmla: 'val 50000' },
        { name: 'x1', fmla: '*/ w a 100000' }, // 1000 * 50000 / 100000 = 500
        { name: 'x2', fmla: '+- r 0 x1' }, // 1000 - 500 = 500
      ],
      c
    );

    expect(result.get('a')).toBe(50000);
    expect(result.get('x1')).toBe(500);
    expect(result.get('x2')).toBe(500);
  });

  it('evaluates roundRect guides correctly', () => {
    const c = createGuideContext(1000, 800, { adj: 16667 });
    const result = evaluateGuides(
      [
        { name: 'a', fmla: 'pin 0 adj 50000' },
        { name: 'x1', fmla: '*/ ss a 100000' },
        { name: 'x2', fmla: '+- r 0 x1' },
        { name: 'y2', fmla: '+- b 0 x1' },
      ],
      c
    );

    // ss = 800, a = 16667 (clamped to 16667)
    // x1 = 800 * 16667 / 100000 = 133.336
    expect(result.get('a')).toBe(16667);
    expect(result.get('x1')).toBeCloseTo(133.336, 1);
    expect(result.get('x2')).toBeCloseTo(1000 - 133.336, 1);
    expect(result.get('y2')).toBeCloseTo(800 - 133.336, 1);
  });

  it('adjust value override propagates through guides', () => {
    // Use adj=0 to get sharp corners in roundRect
    const c = createGuideContext(1000, 800, { adj: 0 });
    const result = evaluateGuides(
      [
        { name: 'a', fmla: 'pin 0 adj 50000' },
        { name: 'x1', fmla: '*/ ss a 100000' },
      ],
      c
    );

    expect(result.get('a')).toBe(0);
    expect(result.get('x1')).toBe(0);
  });

  it('later guides can reference earlier guides', () => {
    const c = createGuideContext(200, 100);
    const result = evaluateGuides(
      [
        { name: 'half_w', fmla: '*/ w 1 2' },
        { name: 'quarter_w', fmla: '*/ half_w 1 2' },
        { name: 'eighth_w', fmla: '*/ quarter_w 1 2' },
      ],
      c
    );

    expect(result.get('half_w')).toBe(100);
    expect(result.get('quarter_w')).toBe(50);
    expect(result.get('eighth_w')).toBe(25);
  });

  it('handles empty guide list', () => {
    const c = createGuideContext(1000, 800);
    const result = evaluateGuides([], c);
    expect(result.get('w')).toBe(1000);
  });
});

describe('Real-world formula chains', () => {
  it('right arrow at 500x300 with default adjusts', () => {
    const c = createGuideContext(500, 300, {
      adj1: 50000,
      adj2: 50000,
    });
    const result = evaluateGuides(
      [
        { name: 'maxAdj2', fmla: '*/ 100000 w ss' },
        { name: 'a1', fmla: 'pin 0 adj1 100000' },
        { name: 'a2', fmla: 'pin 0 adj2 maxAdj2' },
        { name: 'dx1', fmla: '*/ ss a2 100000' },
        { name: 'x1', fmla: '+- r 0 dx1' },
        { name: 'dy1', fmla: '*/ h a1 200000' },
        { name: 'y1', fmla: '+- vc 0 dy1' },
        { name: 'y2', fmla: '+- vc dy1 0' },
      ],
      c
    );

    // ss = 300, maxAdj2 = 100000*500/300 = 166666.67
    expect(result.get('maxAdj2')).toBeCloseTo(166666.67, 0);
    // a1 = 50000 (clamped to [0, 100000])
    expect(result.get('a1')).toBe(50000);
    // a2 = 50000 (clamped to [0, 166666])
    expect(result.get('a2')).toBe(50000);
    // dx1 = 300 * 50000 / 100000 = 150
    expect(result.get('dx1')).toBe(150);
    // x1 = 500 - 150 = 350
    expect(result.get('x1')).toBe(350);
    // dy1 = 300 * 50000 / 200000 = 75
    expect(result.get('dy1')).toBe(75);
    // y1 = 150 - 75 = 75
    expect(result.get('y1')).toBe(75);
    // y2 = 150 + 75 = 225
    expect(result.get('y2')).toBe(225);
  });

  it('trig-based guide (ellipse guides)', () => {
    const c = createGuideContext(200, 100);
    const result = evaluateGuides(
      [
        { name: 'idx', fmla: 'cos wd2 2700000' }, // wd2 * cos(45) = 100 * 0.7071 = 70.71
        { name: 'idy', fmla: 'sin hd2 2700000' }, // hd2 * sin(45) = 50 * 0.7071 = 35.36
        { name: 'il', fmla: '+- hc 0 idx' }, // 100 - 70.71 = 29.29
        { name: 'ir', fmla: '+- hc idx 0' }, // 100 + 70.71 = 170.71
        { name: 'it', fmla: '+- vc 0 idy' }, // 50 - 35.36 = 14.64
        { name: 'ib', fmla: '+- vc idy 0' }, // 50 + 35.36 = 85.36
      ],
      c
    );

    expect(result.get('idx')).toBeCloseTo(70.71068, 3);
    expect(result.get('idy')).toBeCloseTo(35.35534, 3);
    expect(result.get('il')).toBeCloseTo(29.28932, 3);
    expect(result.get('ir')).toBeCloseTo(170.71068, 3);
    expect(result.get('it')).toBeCloseTo(14.64466, 3);
    expect(result.get('ib')).toBeCloseTo(85.35534, 3);
  });
});
