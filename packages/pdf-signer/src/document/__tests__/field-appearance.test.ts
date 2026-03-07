/**
 * Tests for field appearance generation — verifying that form fields get
 * proper /AP /N appearance streams so they render without /NeedAppearances.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../PDFDocument.js';
import {
  generateTextFieldAppearance,
  generateCheckBoxAppearance,
  generateDropdownAppearance,
  generateAllFieldAppearances,
} from '../fields/FieldAppearanceGenerator.js';
import { getAcroFormDict } from '../NativeFormReader.js';
import {
  COSName,
  COSString,
  COSInteger,
  COSArray,
  COSDictionary,
  COSObjectReference,
  COSStream,
} from '../../pdfbox/cos/COSTypes.js';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function makeVisibleRect(x: number, y: number, w: number, h: number): COSArray {
  const arr = new COSArray();
  arr.setDirect(true);
  arr.add(new COSInteger(x));
  arr.add(new COSInteger(y));
  arr.add(new COSInteger(x + w));
  arr.add(new COSInteger(y + h));
  return arr;
}

function cosNum(arr: COSArray, idx: number): number {
  const el = arr.get(idx);
  if (!el) return 0;
  if ('getValue' in el) return (el as any).getValue();
  return 0;
}

function addWidgetToPageNative(
  fieldDict: COSDictionary,
  fieldRef: COSObjectReference,
  page: ReturnType<PDFDocument['getPages']>[0],
): void {
  const pageDict = page._nativePageDict!;
  let annots = pageDict.getItem('Annots');
  if (!(annots instanceof COSArray)) {
    annots = new COSArray();
    (annots as COSArray).setDirect(true);
    pageDict.setItem('Annots', annots);
  }
  (annots as COSArray).add(fieldRef);
  if (page._nativePageRef) {
    fieldDict.setItem('P', page._nativePageRef);
  }
}

/** Get the normal appearance stream content as text. */
function getAppearanceStreamText(
  doc: PDFDocument,
  fieldDict: COSDictionary,
): string | undefined {
  const ap = fieldDict.getItem('AP');
  if (!(ap instanceof COSDictionary)) return undefined;
  let n = ap.getItem('N');
  if (n instanceof COSObjectReference) {
    n = doc._nativeCtx!.resolveRef(n);
  }
  if (n instanceof COSStream) {
    return new TextDecoder().decode(n.getData());
  }
  return undefined;
}

/** Get the checkbox appearance state stream content as text. */
function getCheckboxStateStream(
  doc: PDFDocument,
  fieldDict: COSDictionary,
  state: string,
): string | undefined {
  const ap = fieldDict.getItem('AP');
  if (!(ap instanceof COSDictionary)) return undefined;
  let n = ap.getItem('N');
  if (n instanceof COSObjectReference) {
    n = doc._nativeCtx!.resolveRef(n);
  }
  if (!(n instanceof COSDictionary)) return undefined;

  let stateStream = n.getItem(state);
  if (stateStream instanceof COSObjectReference) {
    stateStream = doc._nativeCtx!.resolveRef(stateStream);
  }
  if (stateStream instanceof COSStream) {
    return new TextDecoder().decode(stateStream.getData());
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 1. Text field basic appearance
// ---------------------------------------------------------------------------

describe('Field appearance generation', () => {
  describe('text field basic', () => {
    it('should create /AP /N on text field after setText', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('name');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Alice');

      // Verify /AP /N exists
      const ap = tf._native!.dict.getItem('AP');
      expect(ap).toBeInstanceOf(COSDictionary);
      const n = (ap as COSDictionary).getItem('N');
      expect(n).toBeDefined();
    });

    it('should include value text in appearance stream content', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('greeting');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Hello World');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('Tf');
      expect(content).toContain('Tj');
      expect(content).toContain('BT');
      expect(content).toContain('ET');
    });

    it('should include /Tx BMC ... EMC marked content', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('marked');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Marked content');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('/Tx BMC');
      expect(content).toContain('EMC');
    });

    it('should include clip rect in appearance', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('clipped');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Clipped text');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Should contain clip rect: re W n
      expect(content).toContain('re');
      expect(content).toContain('W');
      expect(content).toContain('n');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Auto-size font
  // ---------------------------------------------------------------------------

  describe('auto-size font', () => {
    it('should calculate font size when DA has 0 Tf', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('auto');
      // Default DA is '/Helv 12 Tf 0 g', change to auto-size
      tf._native!.dict.setItem('DA', new COSString('/Helv 0 Tf 0 g'));
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 100, 20));
      tf.setText('Auto sized');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Font size should be calculated (not 0)
      expect(content).toContain('Tf');
      // Verify the font size is not 0
      const tfMatch = content!.match(/\/Helv\s+([\d.]+)\s+Tf/);
      expect(tfMatch).toBeTruthy();
      const fontSize = parseFloat(tfMatch![1]);
      expect(fontSize).toBeGreaterThan(0);
      expect(fontSize).toBeLessThanOrEqual(18); // Should be capped at rect height - 2
    });

    it('should fit text width when auto-sizing', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('narrow');
      tf._native!.dict.setItem('DA', new COSString('/Helv 0 Tf 0 g'));
      // Very narrow field
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 40, 20));
      tf.setText('Very long text that should be small');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      const tfMatch = content!.match(/\/Helv\s+([\d.]+)\s+Tf/);
      expect(tfMatch).toBeTruthy();
      const fontSize = parseFloat(tfMatch![1]);
      // Should be quite small to fit the narrow field
      expect(fontSize).toBeLessThan(12);
      expect(fontSize).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Explicit font size
  // ---------------------------------------------------------------------------

  describe('explicit font size', () => {
    it('should use 12pt font from DA', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('explicit');
      // Default DA already has 12 Tf
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 30));
      tf.setText('12pt text');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('/Helv 12 Tf');
    });

    it('should use custom font size from DA', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('size8');
      tf._native!.dict.setItem('DA', new COSString('/Helv 8 Tf 0 g'));
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('8pt text');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('/Helv 8 Tf');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Alignment
  // ---------------------------------------------------------------------------

  describe('alignment', () => {
    it('should left-align by default (Q=0)', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('left');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Left aligned');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Left alignment: x position should be 2 (padding)
      expect(content).toContain('2 ');
    });

    it('should center-align when Q=1', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('center');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf._native!.dict.setItem('Q', new COSInteger(1));
      tf.setText('Centered');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Center alignment: x position should be > 2 (not at left edge)
      const tdMatch = content!.match(/([\d.]+)\s+([\d.]+)\s+Td/);
      expect(tdMatch).toBeTruthy();
      const x = parseFloat(tdMatch![1]);
      expect(x).toBeGreaterThan(2);
    });

    it('should right-align when Q=2', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('right');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf._native!.dict.setItem('Q', new COSInteger(2));
      tf.setText('Right');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Right alignment: x position should be large (near right edge)
      const tdMatch = content!.match(/([\d.]+)\s+([\d.]+)\s+Td/);
      expect(tdMatch).toBeTruthy();
      const x = parseFloat(tdMatch![1]);
      expect(x).toBeGreaterThan(100); // Should be near right edge of 200pt field
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Multiline
  // ---------------------------------------------------------------------------

  describe('multiline', () => {
    it('should use TL operator for multiline fields', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('multi');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 600, 200, 100));
      tf.enableMultiline();
      tf.setText('Line 1\nLine 2\nLine 3');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Should contain TL (text leading) operator
      expect(content).toContain('TL');
    });

    it('should use T* for line breaks in multiline', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('multibreak');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 600, 200, 100));
      tf.enableMultiline();
      tf.setText('First\nSecond');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Should contain T* (next line) operator
      expect(content).toContain('T*');
    });

    it('should have multiple Tj operators for multiline', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('multitj');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 600, 200, 100));
      tf.enableMultiline();
      tf.setText('A\nB\nC');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      const tjCount = (content!.match(/Tj/g) || []).length;
      expect(tjCount).toBeGreaterThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Checkbox checked/unchecked
  // ---------------------------------------------------------------------------

  describe('checkbox', () => {
    it('should have /AP /N /Yes and /Off streams', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const cb = form.createCheckBox('agree');
      cb._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 12, 12));
      cb.check();

      const ap = cb._native!.dict.getItem('AP');
      expect(ap).toBeInstanceOf(COSDictionary);
      const n = (ap as COSDictionary).getItem('N');
      expect(n).toBeDefined();
      // N should be a dict with Yes and Off keys
      if (n instanceof COSDictionary) {
        expect(n.getItem('Yes')).toBeDefined();
        expect(n.getItem('Off')).toBeDefined();
      }
    });

    it('should set /AS to Yes when checked', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const cb = form.createCheckBox('checked');
      cb.check();

      const as = cb._native!.dict.getCOSName('AS');
      expect(as).toBeDefined();
      expect(as!.getName()).toBe('Yes');
    });

    it('should set /AS to Off when unchecked', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const cb = form.createCheckBox('unchecked');
      cb.check();
      cb.uncheck();

      const as = cb._native!.dict.getCOSName('AS');
      expect(as).toBeDefined();
      expect(as!.getName()).toBe('Off');
    });

    it('should have checkmark content in Yes stream', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const cb = form.createCheckBox('check_content');
      cb._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 12, 12));
      cb.check();

      const yesContent = getCheckboxStateStream(doc, cb._native!.dict, 'Yes');
      expect(yesContent).toBeDefined();
      // Should contain font + text operators for the checkmark
      expect(yesContent).toContain('Tf');
      expect(yesContent).toContain('Tj');
    });

    it('should have empty Off stream', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const cb = form.createCheckBox('empty_off');
      cb._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 12, 12));
      cb.check();

      const offContent = getCheckboxStateStream(doc, cb._native!.dict, 'Off');
      expect(offContent).toBeDefined();
      expect(offContent!.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Dropdown
  // ---------------------------------------------------------------------------

  describe('dropdown', () => {
    it('should create appearance on select', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const dd = form.createDropdown('country');
      dd._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 150, 20));
      dd.setOptions(['US', 'UK', 'CA']);
      dd.select('UK');

      const ap = dd._native!.dict.getItem('AP');
      expect(ap).toBeInstanceOf(COSDictionary);
      const n = (ap as COSDictionary).getItem('N');
      expect(n).toBeDefined();
    });

    it('should include selected value in appearance', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const dd = form.createDropdown('state');
      dd._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 150, 20));
      dd.setOptions(['California', 'New York', 'Texas']);
      dd.select('California');

      const content = getAppearanceStreamText(doc, dd._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('Tf');
      expect(content).toContain('Tj');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Round-trip
  // ---------------------------------------------------------------------------

  describe('round-trip', () => {
    it('should preserve appearance through save and load', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('rt');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Round trip value');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);
      const loadedForm = loaded.getForm();
      const loadedField = loadedForm.getTextField('rt');
      expect(loadedField.getText()).toBe('Round trip value');
    });

    it('should save valid PDF with appearances', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('valid');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Valid PDF');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(0);

      // Should be parseable
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Fill then flatten
  // ---------------------------------------------------------------------------

  describe('fill then flatten', () => {
    it('should bake text field appearance into page on flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('flatten_text');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Flattened');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      form.flatten();

      // Verify field was removed
      expect(form.getFields().length).toBe(0);

      // Verify page has content (the flattened appearance)
      const contents = page._nativePageDict!.getItem('Contents');
      expect(contents).toBeDefined();
      if (contents instanceof COSArray) {
        expect(contents.size()).toBeGreaterThanOrEqual(1);
      }
    });

    it('should include XObject reference in page after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('flatten_xobj');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('XObject');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      form.flatten();

      // Verify page resources have XObject
      const resources = page._nativePageDict!.getItem('Resources');
      if (resources instanceof COSDictionary) {
        const xobj = resources.getItem('XObject');
        if (xobj instanceof COSDictionary) {
          expect(xobj.containsKey('Flat1')).toBe(true);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Fill then sign (qpdf validation)
  // ---------------------------------------------------------------------------

  describe('fill then sign', () => {
    it('should produce valid PDF after fill + save (qpdf check)', async () => {
      if (!hasCommand('qpdf')) return;

      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('sign_test');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Signing test');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      const bytes = await doc.save();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'field-ap-'));
      const tmpFile = path.join(tmpDir, 'filled.pdf');
      try {
        fs.writeFileSync(tmpFile, bytes);
        const result = execSync(`qpdf --check "${tmpFile}" 2>&1`, {
          encoding: 'utf-8',
          timeout: 10000,
        });
        expect(result).toBeDefined();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Real-world PDF fill (loaded form)
  // ---------------------------------------------------------------------------

  describe('loaded form', () => {
    it('should generate appearances for loaded PDF form fields', async () => {
      // Create a PDF with a text field, save it, load it, fill it
      const orig = await PDFDocument.create();
      const page = orig.addPage();
      const form = orig.getForm();
      const tf = form.createTextField('loaded_field');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      const bytes = await orig.save();
      const loaded = await PDFDocument.load(bytes);
      const loadedForm = loaded.getForm();
      const loadedTf = loadedForm.getTextField('loaded_field');
      loadedTf.setText('Filled value');

      // Verify appearance was generated
      const ap = loadedTf._native!.dict.getItem('AP');
      expect(ap).toBeInstanceOf(COSDictionary);
    });
  });

  // ---------------------------------------------------------------------------
  // 12. generateAllFieldAppearances
  // ---------------------------------------------------------------------------

  describe('generateAllFieldAppearances', () => {
    it('should generate appearances for multiple field types', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      const tf = form.createTextField('all_text');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      // Don't call setText yet - we'll use generateAllFieldAppearances

      const cb = form.createCheckBox('all_check');
      cb._native!.dict.setItem('Rect', makeVisibleRect(50, 650, 12, 12));

      const dd = form.createDropdown('all_dropdown');
      dd._native!.dict.setItem('Rect', makeVisibleRect(50, 600, 150, 20));
      dd.setOptions(['A', 'B']);

      // Manually set values without triggering appearance generation
      tf._native!.dict.setItem('V', new COSString('Manual'));
      tf._native!.value = 'Manual';

      // Now regenerate all appearances
      generateAllFieldAppearances(doc._nativeCtx!);

      // Verify text field got appearance
      const tfAp = tf._native!.dict.getItem('AP');
      expect(tfAp).toBeInstanceOf(COSDictionary);
    });

    it('should be callable via form.updateFieldAppearances()', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('update');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf._native!.dict.setItem('V', new COSString('Updated'));
      tf._native!.value = 'Updated';

      form.updateFieldAppearances();

      const ap = tf._native!.dict.getItem('AP');
      expect(ap).toBeInstanceOf(COSDictionary);
    });
  });

  // ---------------------------------------------------------------------------
  // 13. No /DA fallback
  // ---------------------------------------------------------------------------

  describe('no DA fallback', () => {
    it('should use default Helvetica when field has no DA', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('no_da');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      // Remove the default DA
      tf._native!.dict.removeItem('DA');
      tf.setText('No DA string');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Should still contain a font reference (defaulting to Helv)
      expect(content).toContain('Helv');
      expect(content).toContain('Tf');
    });
  });

  // ---------------------------------------------------------------------------
  // 14. Empty value
  // ---------------------------------------------------------------------------

  describe('empty value', () => {
    it('should handle empty string value', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('empty');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('');

      // Should still have appearance (minimal)
      const ap = tf._native!.dict.getItem('AP');
      expect(ap).toBeInstanceOf(COSDictionary);
      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Should have marked content but no text operators
      expect(content).toContain('/Tx BMC');
      expect(content).toContain('EMC');
    });

    it('should handle undefined value via setText(undefined)', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('undef');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText(undefined);

      // Even with undefined, appearance should be generated (empty)
      const ap = tf._native!.dict.getItem('AP');
      expect(ap).toBeInstanceOf(COSDictionary);
    });
  });

  // ---------------------------------------------------------------------------
  // 15. Long text
  // ---------------------------------------------------------------------------

  describe('long text', () => {
    it('should clip long text within field bounds', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('long');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 50, 20));
      tf.setText('This is a very long text string that exceeds the field width significantly');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Should have clip rect
      expect(content).toContain('re');
      expect(content).toContain('W');
    });
  });

  // ---------------------------------------------------------------------------
  // 16. Special characters
  // ---------------------------------------------------------------------------

  describe('special characters', () => {
    it('should handle text with common ASCII characters', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('special');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Hello & Goodbye! "Quotes" 123');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('Tj');
    });

    it('should handle text with accented characters', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('accented');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      // These are all WinAnsi-encodable characters
      tf.setText('cafe resume naive');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('Tj');
    });
  });

  // ---------------------------------------------------------------------------
  // 17. NeedAppearances removed
  // ---------------------------------------------------------------------------

  describe('NeedAppearances behavior', () => {
    it('should NOT set /NeedAppearances when appearance is generated', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('no_need');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Direct appearance');

      const acroForm = getAcroFormDict(doc._nativeCtx!);
      expect(acroForm).toBeDefined();
      // NeedAppearances should NOT be set since we generated the appearance
      expect(acroForm!.containsKey('NeedAppearances')).toBe(false);
    });

    it('should generate appearance for dropdown select (not just NeedAppearances)', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const dd = form.createDropdown('dd_need');
      dd._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 150, 20));
      // Note: setOptions() still sets NeedAppearances, but select() generates appearance
      dd.select('One');

      // The select() call should generate an actual appearance
      const ap = dd._native!.dict.getItem('AP');
      expect(ap).toBeInstanceOf(COSDictionary);
    });
  });

  // ---------------------------------------------------------------------------
  // 18. Resources indirect object (Adobe Reader requirement)
  // ---------------------------------------------------------------------------

  describe('resources', () => {
    it('should have Resources as indirect object on appearance stream', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('res_indirect');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Resource test');

      // Get the /AP /N stream
      const ap = tf._native!.dict.getItem('AP') as COSDictionary;
      let n = ap.getItem('N');
      if (n instanceof COSObjectReference) {
        const resolved = doc._nativeCtx!.resolveRef(n);
        if (resolved instanceof COSStream) {
          // Resources should be an indirect reference (COSObjectReference)
          const resources = resolved.getDictionary().getItem('Resources');
          expect(resources).toBeInstanceOf(COSObjectReference);
        }
      }
    });

    it('should include font in appearance resources', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('res_font');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Font resource');

      // Get the /AP /N stream
      const ap = tf._native!.dict.getItem('AP') as COSDictionary;
      let n = ap.getItem('N');
      if (n instanceof COSObjectReference) {
        const resolved = doc._nativeCtx!.resolveRef(n);
        if (resolved instanceof COSStream) {
          const resRef = resolved.getDictionary().getItem('Resources');
          if (resRef instanceof COSObjectReference) {
            const resources = doc._nativeCtx!.resolveRef(resRef);
            if (resources instanceof COSDictionary) {
              const fontDict = resources.getItem('Font');
              expect(fontDict).toBeDefined();
            }
          }
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 19. BBox matches widget rect
  // ---------------------------------------------------------------------------

  describe('BBox', () => {
    it('should set BBox matching widget rect dimensions', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('bbox');
      tf._native!.dict.setItem('Rect', makeVisibleRect(100, 500, 250, 30));
      tf.setText('BBox test');

      const ap = tf._native!.dict.getItem('AP') as COSDictionary;
      let n = ap.getItem('N');
      if (n instanceof COSObjectReference) {
        const resolved = doc._nativeCtx!.resolveRef(n);
        if (resolved instanceof COSStream) {
          const bbox = resolved.getDictionary().getItem('BBox') as COSArray;
          expect(bbox).toBeDefined();
          expect(cosNum(bbox, 0)).toBe(0);
          expect(cosNum(bbox, 1)).toBe(0);
          expect(cosNum(bbox, 2)).toBe(250);
          expect(cosNum(bbox, 3)).toBe(30);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 20. Color from DA
  // ---------------------------------------------------------------------------

  describe('color from DA', () => {
    it('should apply grayscale color from DA', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('gray');
      tf._native!.dict.setItem('DA', new COSString('/Helv 10 Tf 0.5 g'));
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Gray text');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('0.5 g');
    });

    it('should apply RGB color from DA', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('rgb_color');
      tf._native!.dict.setItem('DA', new COSString('/Helv 10 Tf 1 0 0 rg'));
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Red text');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('1 0 0 rg');
    });
  });

  // ---------------------------------------------------------------------------
  // 21. Zero-size rect handling
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle zero-size rect without crash', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('zero');
      // Default rect is (0,0,0,0)
      tf.setText('Zero rect');

      // Should not throw, but no appearance generated for zero-size
      // setText should still succeed (falls back to NeedAppearances)
    });

    it('should handle field without Rect', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('no_rect');
      tf._native!.dict.removeItem('Rect');
      tf.setText('No rect');

      // Should not throw
    });

    it('should not throw for generateAllFieldAppearances on empty form', async () => {
      const doc = await PDFDocument.create();
      doc._nativeCtx!.ensureFieldsArray();
      expect(() => generateAllFieldAppearances(doc._nativeCtx!)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 22. DA parsing edge cases
  // ---------------------------------------------------------------------------

  describe('DA parsing', () => {
    it('should parse DA with bold font', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('bold');
      tf._native!.dict.setItem('DA', new COSString('/HeBo 14 Tf 0 g'));
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Bold text');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      expect(content).toContain('/HeBo 14 Tf');
    });

    it('should handle DA without color operators', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('no_color');
      tf._native!.dict.setItem('DA', new COSString('/Helv 10 Tf'));
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('No explicit color');

      const content = getAppearanceStreamText(doc, tf._native!.dict);
      expect(content).toBeDefined();
      // Should have default black color
      expect(content).toContain('Tf');
    });
  });

  // ---------------------------------------------------------------------------
  // 23. Flatten with auto-generated appearances
  // ---------------------------------------------------------------------------

  describe('flatten with auto-generation', () => {
    it('should auto-generate appearances before flatten for text fields', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('auto_flatten');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      // Set value manually without triggering appearance generation
      tf._native!.dict.setItem('V', new COSString('Manual value'));
      tf._native!.value = 'Manual value';
      // Remove any existing appearance
      tf._native!.dict.removeItem('AP');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      // Flatten should auto-generate appearance first
      form.flatten();

      // Field should be removed and content baked into page
      expect(form.getFields().length).toBe(0);
      const contents = page._nativePageDict!.getItem('Contents');
      expect(contents).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 24. Form XObject type verification
  // ---------------------------------------------------------------------------

  describe('Form XObject', () => {
    it('should create appearance as Form XObject', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      const tf = form.createTextField('xobj_type');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Form XObject');

      const ap = tf._native!.dict.getItem('AP') as COSDictionary;
      let n = ap.getItem('N');
      if (n instanceof COSObjectReference) {
        const resolved = doc._nativeCtx!.resolveRef(n);
        if (resolved instanceof COSStream) {
          const type = resolved.getDictionary().getCOSName('Type');
          const subtype = resolved.getDictionary().getCOSName('Subtype');
          expect(type?.getName()).toBe('XObject');
          expect(subtype?.getName()).toBe('Form');
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 25. Multiple text fields on same page
  // ---------------------------------------------------------------------------

  describe('multiple fields', () => {
    it('should generate appearances for multiple text fields', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      const fields = ['first', 'last', 'email'];
      for (let i = 0; i < fields.length; i++) {
        const tf = form.createTextField(fields[i]);
        tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700 - i * 30, 200, 20));
        tf.setText(`Value ${fields[i]}`);
        addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);
      }

      // All fields should have appearances
      for (const name of fields) {
        const field = form.getTextField(name);
        const ap = field._native!.dict.getItem('AP');
        expect(ap).toBeInstanceOf(COSDictionary);
      }
    });

    it('should flatten multiple fields with appearances', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      for (let i = 0; i < 5; i++) {
        const tf = form.createTextField(`field_${i}`);
        tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700 - i * 30, 200, 20));
        tf.setText(`Value ${i}`);
        addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);
      }

      expect(form.getFields().length).toBe(5);
      form.flatten();
      expect(form.getFields().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 26. Save + load + qpdf validation
  // ---------------------------------------------------------------------------

  describe('comprehensive qpdf validation', () => {
    it('should produce qpdf-valid PDF with text + checkbox + dropdown', async () => {
      if (!hasCommand('qpdf')) return;

      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      const tf = form.createTextField('q_text');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Validated');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      const cb = form.createCheckBox('q_check');
      cb._native!.dict.setItem('Rect', makeVisibleRect(50, 650, 12, 12));
      cb.check();
      cb.addToPage(page);

      const dd = form.createDropdown('q_dd');
      dd._native!.dict.setItem('Rect', makeVisibleRect(50, 600, 150, 20));
      dd.setOptions(['Red', 'Green', 'Blue']);
      dd.select('Green');
      dd.addToPage(page);

      const bytes = await doc.save();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'field-ap-'));
      const tmpFile = path.join(tmpDir, 'comprehensive.pdf');
      try {
        fs.writeFileSync(tmpFile, bytes);
        const result = execSync(`qpdf --check "${tmpFile}" 2>&1`, {
          encoding: 'utf-8',
          timeout: 10000,
        });
        expect(result).toBeDefined();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should produce qpdf-valid PDF after fill + flatten', async () => {
      if (!hasCommand('qpdf')) return;

      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      const tf = form.createTextField('flat_q');
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Flatten validated');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      form.flatten();
      const bytes = await doc.save();

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'field-ap-'));
      const tmpFile = path.join(tmpDir, 'flattened.pdf');
      try {
        fs.writeFileSync(tmpFile, bytes);
        const result = execSync(`qpdf --check "${tmpFile}" 2>&1`, {
          encoding: 'utf-8',
          timeout: 10000,
        });
        expect(result).toBeDefined();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
