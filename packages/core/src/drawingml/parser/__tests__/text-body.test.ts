import { describe, it, expect } from 'vitest';
import { parseXml } from '../../../xml/index.js';
import { parseTextBody, parseTextBodyFromParent } from '../text-body.js';
import type { ThemeIR } from '../../../ir/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

const TEST_THEME: ThemeIR = {
  name: 'Test Theme',
  colorScheme: {
    dk1: { r: 0, g: 0, b: 0, a: 1 },
    lt1: { r: 255, g: 255, b: 255, a: 1 },
    dk2: { r: 68, g: 84, b: 106, a: 1 },
    lt2: { r: 231, g: 230, b: 230, a: 1 },
    accent1: { r: 68, g: 114, b: 196, a: 1 },
    accent2: { r: 237, g: 125, b: 49, a: 1 },
    accent3: { r: 165, g: 165, b: 165, a: 1 },
    accent4: { r: 255, g: 192, b: 0, a: 1 },
    accent5: { r: 91, g: 155, b: 213, a: 1 },
    accent6: { r: 112, g: 173, b: 71, a: 1 },
    hlink: { r: 5, g: 99, b: 193, a: 1 },
    folHlink: { r: 149, g: 79, b: 114, a: 1 },
  },
  fontScheme: {
    majorLatin: 'Calibri Light',
    minorLatin: 'Calibri',
  },
  formatScheme: {
    fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    lineStyles: [{}, {}, {}],
    effectStyles: [[], [], []],
    bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
  },
};

// ---------------------------------------------------------------------------
// Tests: parseTextBody
// ---------------------------------------------------------------------------

describe('parseTextBody', () => {
  describe('body properties', () => {
    it('parses wrap mode', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr wrap="square"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.wrap).toBe('square');
    });

    it('parses wrap=none', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr wrap="none"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.wrap).toBe('none');
    });

    it('parses vertical alignment (top)', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr anchor="t"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.verticalAlign).toBe('top');
    });

    it('parses vertical alignment (center)', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr anchor="ctr"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.verticalAlign).toBe('middle');
    });

    it('parses vertical alignment (bottom)', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr anchor="b"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.verticalAlign).toBe('bottom');
    });

    it('parses vertical alignment (distributed)', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr anchor="dist"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.verticalAlign).toBe('distributed');
    });

    it('parses anchorCtr', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr anchorCtr="1"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.anchorCtr).toBe(true);
    });

    it('parses insets in EMU', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr lIns="91440" tIns="45720" rIns="91440" bIns="45720"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.leftInset).toBe(91440);
      expect(body.bodyProperties.topInset).toBe(45720);
      expect(body.bodyProperties.rightInset).toBe(91440);
      expect(body.bodyProperties.bottomInset).toBe(45720);
    });

    it('parses column count and spacing', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr numCol="2" spcCol="457200"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.columns).toBe(2);
      expect(body.bodyProperties.columnSpacing).toBe(457200);
    });

    it('parses rotation in degrees from 60000ths', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr rot="5400000"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.rotation).toBe(90);
    });
  });

  describe('auto-fit modes', () => {
    it('parses spAutoFit', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr><a:spAutoFit/></a:bodyPr>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.autoFit).toBe('spAutoFit');
    });

    it('parses noAutofit', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr><a:noAutofit/></a:bodyPr>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.autoFit).toBe('none');
    });

    it('parses normAutofit (shrink)', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr><a:normAutofit fontScale="90000"/></a:bodyPr>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.autoFit).toBe('shrink');
    });

    it('parses normAutofit with fontScale', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr><a:normAutofit fontScale="80000"/></a:bodyPr>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.autoFit).toBe('shrink');
      expect(body.bodyProperties.fontScale).toBe(80);
    });

    it('parses normAutofit with lnSpcReduction', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr><a:normAutofit fontScale="80000" lnSpcReduction="20000"/></a:bodyPr>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.autoFit).toBe('shrink');
      expect(body.bodyProperties.fontScale).toBe(80);
      expect(body.bodyProperties.lnSpcReduction).toBe(20);
    });

    it('parses normAutofit without fontScale or lnSpcReduction', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr><a:normAutofit/></a:bodyPr>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.autoFit).toBe('shrink');
      expect(body.bodyProperties.fontScale).toBeUndefined();
      expect(body.bodyProperties.lnSpcReduction).toBeUndefined();
    });

    it('does not set fontScale for spAutoFit or noAutofit', () => {
      const spAutoEl = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr><a:spAutoFit/></a:bodyPr>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const spAutoBody = parseTextBody(spAutoEl, TEST_THEME);
      expect(spAutoBody.bodyProperties.fontScale).toBeUndefined();

      const noAutoEl = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr><a:noAutofit/></a:bodyPr>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const noAutoBody = parseTextBody(noAutoEl, TEST_THEME);
      expect(noAutoBody.bodyProperties.fontScale).toBeUndefined();
    });

    it('defaults autoFit to undefined when no autofit child', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr wrap="square"/>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.autoFit).toBeUndefined();
    });
  });

  describe('multiple paragraphs', () => {
    it('parses multiple paragraphs', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:r><a:t>First</a:t></a:r></a:p>
          <a:p><a:r><a:t>Second</a:t></a:r></a:p>
          <a:p><a:r><a:t>Third</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.paragraphs).toHaveLength(3);
      expect(body.paragraphs[0].runs[0].kind).toBe('run');
      expect((body.paragraphs[0].runs[0] as { kind: 'run'; text: string }).text).toBe('First');
      expect((body.paragraphs[1].runs[0] as { kind: 'run'; text: string }).text).toBe('Second');
      expect((body.paragraphs[2].runs[0] as { kind: 'run'; text: string }).text).toBe('Third');
    });

    it('handles single empty paragraph', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr/>
          <a:p><a:endParaRPr lang="en-US"/></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.paragraphs).toHaveLength(1);
      expect(body.paragraphs[0].runs).toHaveLength(0);
    });

    it('handles text body without bodyPr', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties).toEqual({});
      expect(body.paragraphs).toHaveLength(1);
    });
  });

  describe('full body properties', () => {
    it('parses all body properties together', () => {
      const el = parseXml(
        `<a:txBody ${NS}>
          <a:bodyPr wrap="square" anchor="ctr" anchorCtr="0"
                    lIns="91440" tIns="45720" rIns="91440" bIns="45720"
                    numCol="1" spcCol="0" rot="0">
            <a:spAutoFit/>
          </a:bodyPr>
          <a:p><a:r><a:t>text</a:t></a:r></a:p>
        </a:txBody>`
      );
      const body = parseTextBody(el, TEST_THEME);

      expect(body.bodyProperties.wrap).toBe('square');
      expect(body.bodyProperties.verticalAlign).toBe('middle');
      expect(body.bodyProperties.anchorCtr).toBe(false);
      expect(body.bodyProperties.leftInset).toBe(91440);
      expect(body.bodyProperties.topInset).toBe(45720);
      expect(body.bodyProperties.rightInset).toBe(91440);
      expect(body.bodyProperties.bottomInset).toBe(45720);
      expect(body.bodyProperties.columns).toBe(1);
      expect(body.bodyProperties.columnSpacing).toBe(0);
      expect(body.bodyProperties.rotation).toBe(0);
      expect(body.bodyProperties.autoFit).toBe('spAutoFit');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: parseTextBodyFromParent
// ---------------------------------------------------------------------------

describe('parseTextBodyFromParent', () => {
  it('parses text body from p:txBody child', () => {
    const el = parseXml(
      `<p:sp ${NS}>
        <p:txBody>
          <a:bodyPr wrap="square"/>
          <a:p><a:r><a:t>hello</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>`
    );
    const body = parseTextBodyFromParent(el, TEST_THEME);

    expect(body).toBeDefined();
    expect(body!.bodyProperties.wrap).toBe('square');
    expect(body!.paragraphs).toHaveLength(1);
  });

  it('parses text body from a:txBody child', () => {
    const el = parseXml(
      `<a:tc ${NS}>
        <a:txBody>
          <a:bodyPr anchor="t"/>
          <a:p><a:r><a:t>cell text</a:t></a:r></a:p>
        </a:txBody>
      </a:tc>`
    );
    const body = parseTextBodyFromParent(el, TEST_THEME);

    expect(body).toBeDefined();
    expect(body!.bodyProperties.verticalAlign).toBe('top');
  });

  it('returns undefined when no text body child exists', () => {
    const el = parseXml(
      `<p:sp ${NS}>
        <p:spPr/>
      </p:sp>`
    );
    const body = parseTextBodyFromParent(el, TEST_THEME);

    expect(body).toBeUndefined();
  });
});
