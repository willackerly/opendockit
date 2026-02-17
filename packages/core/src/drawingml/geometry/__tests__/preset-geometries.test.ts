import { describe, it, expect } from 'vitest';
import { getPresetGeometry, getPresetGeometryNames } from '../preset-geometries.js';
import { createGuideContext, evaluateGuides, evaluateFormula } from '../shape-guide-eval.js';

describe('getPresetGeometry', () => {
  it('returns a valid definition for rect', () => {
    const def = getPresetGeometry('rect');
    expect(def).toBeDefined();
    expect(def!.name).toBe('rect');
    expect(def!.pathLst.length).toBeGreaterThan(0);
  });

  it('returns a valid definition for roundRect with adjust values', () => {
    const def = getPresetGeometry('roundRect');
    expect(def).toBeDefined();
    expect(def!.name).toBe('roundRect');
    expect(def!.avLst.length).toBe(1);
    expect(def!.avLst[0].name).toBe('adj');
    expect(def!.avLst[0].fmla).toBe('val 16667');
  });

  it('returns undefined for unknown shape', () => {
    expect(getPresetGeometry('unknown')).toBeUndefined();
    expect(getPresetGeometry('')).toBeUndefined();
  });

  it('returns undefined for null-like inputs', () => {
    expect(getPresetGeometry('null')).toBeUndefined();
    expect(getPresetGeometry('undefined')).toBeUndefined();
  });
});

describe('getPresetGeometryNames', () => {
  it('returns all 187 OOXML preset shapes', () => {
    const names = getPresetGeometryNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBe(187);
  });

  it('includes essential shapes', () => {
    const names = getPresetGeometryNames();
    expect(names).toContain('rect');
    expect(names).toContain('roundRect');
    expect(names).toContain('ellipse');
    expect(names).toContain('line');
    expect(names).toContain('triangle');
    expect(names).toContain('diamond');
    expect(names).toContain('rightArrow');
    expect(names).toContain('leftArrow');
    expect(names).toContain('upArrow');
    expect(names).toContain('downArrow');
  });

  it('includes newly added shape categories', () => {
    const names = getPresetGeometryNames();
    // Stars & banners
    expect(names).toContain('star7');
    expect(names).toContain('star8');
    expect(names).toContain('star10');
    expect(names).toContain('star12');
    expect(names).toContain('star16');
    expect(names).toContain('star24');
    expect(names).toContain('star32');
    // Callouts
    expect(names).toContain('accentBorderCallout1');
    expect(names).toContain('accentCallout1');
    expect(names).toContain('borderCallout1');
    expect(names).toContain('cloudCallout');
    expect(names).toContain('wedgeEllipseCallout');
    expect(names).toContain('wedgeRectCallout');
    expect(names).toContain('wedgeRoundRectCallout');
    // Flowchart
    expect(names).toContain('flowChartCollate');
    expect(names).toContain('flowChartDocument');
    expect(names).toContain('flowChartMagneticDisk');
    expect(names).toContain('flowChartSort');
    // Action buttons
    expect(names).toContain('actionButtonBlank');
    expect(names).toContain('actionButtonHome');
    expect(names).toContain('actionButtonHelp');
    // Math
    expect(names).toContain('mathDivide');
    expect(names).toContain('mathEqual');
    expect(names).toContain('mathMinus');
    expect(names).toContain('mathMultiply');
    expect(names).toContain('mathNotEqual');
    expect(names).toContain('mathPlus');
    // Basic shapes
    expect(names).toContain('moon');
    expect(names).toContain('smileyFace');
    expect(names).toContain('sun');
    expect(names).toContain('blockArc');
    expect(names).toContain('foldedCorner');
    expect(names).toContain('lightningBolt');
    // Arrows
    expect(names).toContain('bentArrow');
    expect(names).toContain('bentUpArrow');
    expect(names).toContain('curvedDownArrow');
    expect(names).toContain('notchedRightArrow');
    expect(names).toContain('stripedRightArrow');
    expect(names).toContain('uturnArrow');
    // Connectors
    expect(names).toContain('bentConnector2');
    expect(names).toContain('bentConnector3');
    expect(names).toContain('curvedConnector3');
  });
});

describe('Preset shape validity', () => {
  it('every preset has valid pathLst with at least one path', () => {
    const names = getPresetGeometryNames();
    for (const name of names) {
      const def = getPresetGeometry(name);
      expect(def, `missing definition for ${name}`).toBeDefined();
      expect(def!.pathLst.length, `${name} has no paths`).toBeGreaterThanOrEqual(1);
    }
  });

  it('every preset path has at least one command', () => {
    const names = getPresetGeometryNames();
    for (const name of names) {
      const def = getPresetGeometry(name)!;
      for (let i = 0; i < def.pathLst.length; i++) {
        expect(
          def.pathLst[i].commands.length,
          `${name} path[${i}] has no commands`
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('all avLst entries have valid formulas', () => {
    const names = getPresetGeometryNames();
    for (const name of names) {
      const def = getPresetGeometry(name)!;
      for (const av of def.avLst) {
        expect(av.name, `${name} avLst has entry with no name`).toBeTruthy();
        expect(av.fmla, `${name} avLst entry ${av.name} has no formula`).toBeTruthy();
      }
    }
  });

  it('all gdLst entries have valid formulas', () => {
    const names = getPresetGeometryNames();
    for (const name of names) {
      const def = getPresetGeometry(name)!;
      for (const gd of def.gdLst) {
        expect(gd.name, `${name} gdLst has entry with no name`).toBeTruthy();
        expect(gd.fmla, `${name} gdLst entry ${gd.name} has no formula`).toBeTruthy();
      }
    }
  });
});

describe('Evaluate rect geometry', () => {
  it('produces correct coordinates at 100x100', () => {
    const def = getPresetGeometry('rect')!;
    const c = createGuideContext(100, 100);

    // rect has no guides, so just check the path references resolve
    // Path commands reference l, t, r, b which are built-ins
    expect(c.get('l')).toBe(0);
    expect(c.get('t')).toBe(0);
    expect(c.get('r')).toBe(100);
    expect(c.get('b')).toBe(100);

    // Verify path starts with moveTo l,t
    expect(def.pathLst[0].commands[0]).toEqual({
      type: 'moveTo',
      x: 'l',
      y: 't',
    });
  });

  it('produces correct coordinates at 200x50', () => {
    const c = createGuideContext(200, 50);
    expect(c.get('l')).toBe(0);
    expect(c.get('t')).toBe(0);
    expect(c.get('r')).toBe(200);
    expect(c.get('b')).toBe(50);
    expect(c.get('hc')).toBe(100);
    expect(c.get('vc')).toBe(25);
  });
});

describe('Evaluate roundRect geometry', () => {
  it('evaluates with default adj at 200x100', () => {
    const def = getPresetGeometry('roundRect')!;

    // First evaluate avLst to get default adjust values
    const c = createGuideContext(200, 100);
    for (const av of def.avLst) {
      const val = evaluateFormula(av.fmla, c);
      evaluateGuides([{ name: av.name, fmla: av.fmla }], c);
    }

    // Then evaluate gdLst
    const result = evaluateGuides(def.gdLst, c);

    // ss = min(200, 100) = 100
    // adj = 16667 (default)
    // a = pin(0, 16667, 50000) = 16667
    expect(result.get('a')).toBe(16667);
    // x1 = ss * a / 100000 = 100 * 16667 / 100000 = 16.667
    expect(result.get('x1')).toBeCloseTo(16.667, 1);
    // x2 = r - x1 = 200 - 16.667 = 183.333
    expect(result.get('x2')).toBeCloseTo(183.333, 1);
    // y2 = b - x1 = 100 - 16.667 = 83.333
    expect(result.get('y2')).toBeCloseTo(83.333, 1);
  });

  it('evaluates with adj=0 (sharp corners)', () => {
    const def = getPresetGeometry('roundRect')!;
    // When the document provides an override, avLst defaults are skipped.
    // The override is passed directly via adjustValues.
    const c = createGuideContext(200, 100, { adj: 0 });
    const result = evaluateGuides(def.gdLst, c);

    expect(result.get('a')).toBe(0);
    expect(result.get('x1')).toBe(0);
    expect(result.get('x2')).toBe(200);
    expect(result.get('y2')).toBe(100);
  });

  it('evaluates with adj=50000 (max rounding)', () => {
    const def = getPresetGeometry('roundRect')!;
    // Document override replaces the default avLst value
    const c = createGuideContext(200, 100, { adj: 50000 });
    const result = evaluateGuides(def.gdLst, c);

    // ss = 100, a = 50000
    // x1 = 100 * 50000 / 100000 = 50
    expect(result.get('a')).toBe(50000);
    expect(result.get('x1')).toBe(50);
    expect(result.get('x2')).toBe(150);
    expect(result.get('y2')).toBe(50);
  });
});

describe('Evaluate ellipse geometry', () => {
  it('evaluates guides at 200x100', () => {
    const def = getPresetGeometry('ellipse')!;
    const c = createGuideContext(200, 100);
    const result = evaluateGuides(def.gdLst, c);

    // idx = cos(wd2, cd8) = wd2 * cos(45) = 100 * 0.7071 = 70.71
    expect(result.get('idx')).toBeCloseTo(70.71068, 3);
    // idy = sin(hd2, cd8) = hd2 * sin(45) = 50 * 0.7071 = 35.36
    expect(result.get('idy')).toBeCloseTo(35.35534, 3);
    // il = hc - idx = 100 - 70.71 = 29.29
    expect(result.get('il')).toBeCloseTo(29.28932, 3);
  });
});

describe('Evaluate triangle geometry', () => {
  it('evaluates at 200x100 with default adj', () => {
    const def = getPresetGeometry('triangle')!;
    const c = createGuideContext(200, 100, { adj: 50000 });
    for (const av of def.avLst) {
      evaluateGuides([{ name: av.name, fmla: av.fmla }], c);
    }
    const result = evaluateGuides(def.gdLst, c);

    // a = pin(0, 50000, 100000) = 50000
    expect(result.get('a')).toBe(50000);
    // x1 = w * a / 200000 = 200 * 50000 / 200000 = 50
    expect(result.get('x1')).toBe(50);
    // x2 = w * a / 100000 = 200 * 50000 / 100000 = 100
    expect(result.get('x2')).toBe(100);
    // x3 = x1 + wd2 = 50 + 100 = 150
    expect(result.get('x3')).toBe(150);
  });
});

describe('Evaluate diamond geometry', () => {
  it('uses built-in variables directly', () => {
    const def = getPresetGeometry('diamond')!;
    const c = createGuideContext(100, 100);
    const result = evaluateGuides(def.gdLst, c);

    // ir = w * 3/4 = 75
    expect(result.get('ir')).toBe(75);
    // ib = h * 3/4 = 75
    expect(result.get('ib')).toBe(75);

    // Path: moveTo l,vc -> 0,50 / lnTo hc,t -> 50,0 / etc.
    expect(c.get('hc')).toBe(50);
    expect(c.get('vc')).toBe(50);
  });
});

describe('Evaluate plus (cross) geometry', () => {
  it('evaluates at 100x100 with default adj', () => {
    const def = getPresetGeometry('plus')!;
    const c = createGuideContext(100, 100, { adj: 25000 });
    for (const av of def.avLst) {
      evaluateGuides([{ name: av.name, fmla: av.fmla }], c);
    }
    const result = evaluateGuides(def.gdLst, c);

    // ss = 100, a = 25000
    // x1 = 100 * 25000 / 100000 = 25
    expect(result.get('x1')).toBe(25);
    // x2 = 100 - 25 = 75
    expect(result.get('x2')).toBe(75);
    // y2 = 100 - 25 = 75
    expect(result.get('y2')).toBe(75);
    // d = w - h = 0
    expect(result.get('d')).toBe(0);
  });
});

describe('Evaluate rightArrow geometry', () => {
  it('evaluates at 300x100 with default adjusts', () => {
    const def = getPresetGeometry('rightArrow')!;
    const c = createGuideContext(300, 100, { adj1: 50000, adj2: 50000 });
    for (const av of def.avLst) {
      evaluateGuides([{ name: av.name, fmla: av.fmla }], c);
    }
    const result = evaluateGuides(def.gdLst, c);

    // ss = 100
    // maxAdj2 = 100000 * 300 / 100 = 300000
    expect(result.get('maxAdj2')).toBe(300000);
    // dx1 = 100 * 50000 / 100000 = 50
    expect(result.get('dx1')).toBe(50);
    // x1 = 300 - 50 = 250
    expect(result.get('x1')).toBe(250);
    // dy1 = 100 * 50000 / 200000 = 25
    expect(result.get('dy1')).toBe(25);
    // y1 = 50 - 25 = 25
    expect(result.get('y1')).toBe(25);
    // y2 = 50 + 25 = 75
    expect(result.get('y2')).toBe(75);
  });
});

describe('Evaluate newly added shapes', () => {
  it('moon evaluates at 200x200 with default adj', () => {
    const def = getPresetGeometry('moon')!;
    expect(def).toBeDefined();
    expect(def.name).toBe('moon');
    const c = createGuideContext(200, 200, { adj: 50000 });
    const result = evaluateGuides(def.gdLst, c);

    // ss = 200, a = pin(0, 50000, 87500) = 50000
    expect(result.get('a')).toBe(50000);
    // g0 = ss * a / 100000 = 200 * 50000 / 100000 = 100
    expect(result.get('g0')).toBe(100);
    // g0w = g0 * w / ss = 100 * 200 / 200 = 100
    expect(result.get('g0w')).toBe(100);
    // g1 = ss - g0 = 200 - 100 = 100
    expect(result.get('g1')).toBe(100);
  });

  it('blockArc evaluates at 200x200', () => {
    const def = getPresetGeometry('blockArc')!;
    expect(def).toBeDefined();
    expect(def.name).toBe('blockArc');
    expect(def.avLst.length).toBe(3);
    expect(def.pathLst.length).toBeGreaterThanOrEqual(1);
  });

  it('flowChartDocument has correct structure', () => {
    const def = getPresetGeometry('flowChartDocument')!;
    expect(def).toBeDefined();
    expect(def.name).toBe('flowChartDocument');
    // flowChartDocument uses cubicBezTo
    const hasCubicBez = def.pathLst.some((p) => p.commands.some((c) => c.type === 'cubicBezTo'));
    expect(hasCubicBez).toBe(true);
  });

  it('actionButtonHome has multiple paths', () => {
    const def = getPresetGeometry('actionButtonHome')!;
    expect(def).toBeDefined();
    // Action buttons typically have multiple paths (base + icon)
    expect(def.pathLst.length).toBeGreaterThan(1);
  });

  it('mathPlus evaluates at 100x100', () => {
    const def = getPresetGeometry('mathPlus')!;
    expect(def).toBeDefined();
    expect(def.avLst.length).toBeGreaterThan(0);
    const c = createGuideContext(100, 100, { adj1: 23520 });
    const result = evaluateGuides(def.gdLst, c);
    // Verify at least one guide resolved
    expect(result.has(def.gdLst[0].name)).toBe(true);
  });

  it('smileyFace has quadBezTo command', () => {
    const def = getPresetGeometry('smileyFace')!;
    expect(def).toBeDefined();
    const hasQuadBez = def.pathLst.some((p) => p.commands.some((c) => c.type === 'quadBezTo'));
    expect(hasQuadBez).toBe(true);
  });

  it('sun evaluates at 200x200', () => {
    const def = getPresetGeometry('sun')!;
    expect(def).toBeDefined();
    expect(def.avLst.length).toBe(1);
    const c = createGuideContext(200, 200, { adj: 25000 });
    const result = evaluateGuides(def.gdLst, c);
    expect(result.get('a')).toBe(25000);
  });

  it('star12 evaluates at 100x100', () => {
    const def = getPresetGeometry('star12')!;
    expect(def).toBeDefined();
    expect(def.avLst.length).toBeGreaterThan(0);
    const c = createGuideContext(100, 100, { adj: 37500 });
    const result = evaluateGuides(def.gdLst, c);
    expect(result.get('a')).toBe(37500);
  });

  it('notchedRightArrow evaluates at 300x100', () => {
    const def = getPresetGeometry('notchedRightArrow')!;
    expect(def).toBeDefined();
    const c = createGuideContext(300, 100, { adj1: 50000, adj2: 50000 });
    const result = evaluateGuides(def.gdLst, c);
    // Verify guide evaluation succeeded
    expect(result.has(def.gdLst[0].name)).toBe(true);
  });
});

describe('Shapes with complex formulas', () => {
  it('hexagon evaluates at 200x200', () => {
    const def = getPresetGeometry('hexagon')!;
    const c = createGuideContext(200, 200, { adj: 25000, vf: 115470 });
    for (const av of def.avLst) {
      evaluateGuides([{ name: av.name, fmla: av.fmla }], c);
    }
    const result = evaluateGuides(def.gdLst, c);

    // ss = 200, maxAdj = 50000 * 200/200 = 50000
    expect(result.get('maxAdj')).toBe(50000);
    // a = pin(0, 25000, 50000) = 25000
    expect(result.get('a')).toBe(25000);
    // x1 = 200 * 25000 / 100000 = 50
    expect(result.get('x1')).toBe(50);
    // x2 = 200 - 50 = 150
    expect(result.get('x2')).toBe(150);
  });

  it('star4 evaluates at 100x100', () => {
    const def = getPresetGeometry('star4')!;
    const c = createGuideContext(100, 100, { adj: 12500 });
    for (const av of def.avLst) {
      evaluateGuides([{ name: av.name, fmla: av.fmla }], c);
    }
    const result = evaluateGuides(def.gdLst, c);

    // a = pin(0, 12500, 50000) = 12500
    expect(result.get('a')).toBe(12500);
    // iwd2 = wd2 * a / 50000 = 50 * 12500 / 50000 = 12.5
    expect(result.get('iwd2')).toBe(12.5);
    // ihd2 = hd2 * a / 50000 = 50 * 12500 / 50000 = 12.5
    expect(result.get('ihd2')).toBe(12.5);
    // sdx = cos(iwd2, cd8) = 12.5 * cos(45) = 8.839
    expect(result.get('sdx')).toBeCloseTo(8.839, 2);
  });
});
