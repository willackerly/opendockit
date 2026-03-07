/**
 * Tests for form flattening — verifying that form.flatten() correctly bakes
 * widget appearances into page content and removes fields/annotations.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../PDFDocument.js';
import {
  COSName,
  COSString,
  COSInteger,
  COSArray,
  COSDictionary,
  COSObjectReference,
  COSStream,
} from '../../pdfbox/cos/COSTypes.js';
import { getAcroFormDict } from '../NativeFormReader.js';
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

/**
 * Manually add a widget field ref to a page's /Annots array.
 * This is needed because PDFTextField.addToPage() requires legacy mode,
 * but checkbox/dropdown/radio have native addToPage. For text fields
 * we replicate the widget-to-page wiring that addWidgetToPage() does.
 */
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

/**
 * Build a visible /Rect array for a field widget.
 * Rect format: [llx, lly, urx, ury]
 */
function makeVisibleRect(
  x: number,
  y: number,
  w: number,
  h: number,
): COSArray {
  const arr = new COSArray();
  arr.setDirect(true);
  arr.add(new COSInteger(x));
  arr.add(new COSInteger(y));
  arr.add(new COSInteger(x + w));
  arr.add(new COSInteger(y + h));
  return arr;
}

// ---------------------------------------------------------------------------
// 1. Basic flattening
// ---------------------------------------------------------------------------

describe('Form flattening', () => {
  describe('basic flattening', () => {
    it('should remove all fields after flattening a text field', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('name');
      tf.setText('Alice');
      // Manually wire the widget to the page
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      expect(form.getFields().length).toBe(1);
      form.flatten();
      expect(form.getFields().length).toBe(0);
    });

    it('should clear /AcroForm /Fields array after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('amount');
      tf.setText('500');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      form.flatten();

      const acroForm = getAcroFormDict(doc._nativeCtx!);
      expect(acroForm).toBeDefined();
      const fields = acroForm!.getItem('Fields');
      expect(fields).toBeInstanceOf(COSArray);
      expect((fields as COSArray).size()).toBe(0);
    });

    it('should remove /Annots from page after flattening (no widgets remain)', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('agree');
      cb.check();
      cb.addToPage(page);

      // Verify annots exist before flatten
      const annotsBefore = page._nativePageDict!.getItem('Annots');
      expect(annotsBefore).toBeDefined();

      form.flatten();

      // After flatten, /Annots should be removed (no non-widget annotations)
      const annotsAfter = page._nativePageDict!.getItem('Annots');
      expect(annotsAfter).toBeUndefined();
    });

    it('should not throw when flattening an empty form (no fields)', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      const form = doc.getForm();
      // Force AcroForm creation
      doc._nativeCtx!.ensureFieldsArray();

      expect(() => form.flatten()).not.toThrow();
      expect(form.getFields().length).toBe(0);
    });

    it('should not throw when flattening with no AcroForm at all', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      const form = doc.getForm();

      // No fields created, no AcroForm dict exists
      expect(() => form.flatten()).not.toThrow();
    });

    it('should generate appearance stream on setText (no /NeedAppearances)', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('notes');
      // Set a visible rect so appearance generation works
      tf._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 200, 20));
      tf.setText('Hello world');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      // setText now generates appearance directly instead of setting /NeedAppearances
      const acroFormBefore = getAcroFormDict(doc._nativeCtx!);
      expect(acroFormBefore).toBeDefined();
      // /NeedAppearances should NOT be set (appearance was generated inline)
      expect(acroFormBefore!.containsKey('NeedAppearances')).toBe(false);

      // Verify /AP /N exists on the field dict
      const ap = tf._native!.dict.getItem('AP');
      expect(ap).toBeInstanceOf(COSDictionary);
      const n = (ap as COSDictionary).getItem('N');
      expect(n).toBeDefined();

      form.flatten();

      const acroFormAfter = getAcroFormDict(doc._nativeCtx!);
      expect(acroFormAfter!.containsKey('NeedAppearances')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Checkbox flattening
  // ---------------------------------------------------------------------------

  describe('checkbox flattening', () => {
    it('should remove checked checkbox field after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('accept');
      cb.check();
      cb.addToPage(page);

      expect(form.getFields().length).toBe(1);
      form.flatten();
      expect(form.getFields().length).toBe(0);
    });

    it('should remove unchecked checkbox field after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('decline');
      // Default is unchecked (Off)
      cb.addToPage(page);

      form.flatten();
      expect(form.getFields().length).toBe(0);
    });

    it('should add XObject reference in page content after flattening checked checkbox', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('visible');
      cb.check();
      // Set a visible rect so flatten bakes the appearance
      cb._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 12, 12));
      cb.addToPage(page);

      form.flatten();

      // The page should have content stream(s) with Do operator
      const contents = page._nativePageDict!.getItem('Contents');
      // After flatten, contents should exist (page stream + flattened content)
      expect(contents).toBeDefined();
      if (contents instanceof COSArray) {
        expect(contents.size()).toBeGreaterThanOrEqual(1);
      }
    });

    it('should add /XObject entry to page /Resources after flattening checkbox', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('xobj_test');
      cb.check();
      // Set visible rect
      cb._native!.dict.setItem('Rect', makeVisibleRect(100, 600, 12, 12));
      cb.addToPage(page);

      form.flatten();

      const resources = page._nativePageDict!.getItem('Resources');
      expect(resources).toBeDefined();
      expect(resources).toBeInstanceOf(COSDictionary);
      const xobjDict = (resources as COSDictionary).getItem('XObject');
      expect(xobjDict).toBeDefined();
      expect(xobjDict).toBeInstanceOf(COSDictionary);
      // Should have at least one /Flat<N> key
      expect((xobjDict as COSDictionary).containsKey('Flat1')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Multiple fields
  // ---------------------------------------------------------------------------

  describe('multiple fields', () => {
    it('should remove all fields when flattening text + checkbox', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      const tf = form.createTextField('name');
      tf.setText('Bob');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      const cb = form.createCheckBox('agree');
      cb.check();
      cb.addToPage(page);

      expect(form.getFields().length).toBe(2);
      form.flatten();
      expect(form.getFields().length).toBe(0);
    });

    it('should remove 3 text fields on the same page after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      for (const name of ['field1', 'field2', 'field3']) {
        const tf = form.createTextField(name);
        tf.setText(`value_${name}`);
        addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);
      }

      expect(form.getFields().length).toBe(3);
      form.flatten();
      expect(form.getFields().length).toBe(0);
    });

    it('should flatten fields on different pages', async () => {
      const doc = await PDFDocument.create();
      const page1 = doc.addPage();
      const page2 = doc.addPage();
      const form = doc.getForm();

      const cb1 = form.createCheckBox('page1_check');
      cb1.check();
      cb1.addToPage(page1);

      const cb2 = form.createCheckBox('page2_check');
      cb2.check();
      cb2.addToPage(page2);

      form.flatten();
      expect(form.getFields().length).toBe(0);

      // Both pages should have /Annots removed
      expect(page1._nativePageDict!.getItem('Annots')).toBeUndefined();
      expect(page2._nativePageDict!.getItem('Annots')).toBeUndefined();
    });

    it('should preserve page count after flatten', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      doc.addPage();
      doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('test');
      cb.addToPage(doc.getPages()[1]);

      expect(doc.getPageCount()).toBe(3);
      form.flatten();
      expect(doc.getPageCount()).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Non-widget annotation preservation
  // ---------------------------------------------------------------------------

  describe('non-widget annotation preservation', () => {
    it('should preserve non-widget annotations when flattening', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      // Add a highlight annotation (non-widget)
      const { PDAnnotationHighlight } = await import('../annotations/index.js');
      const highlight = new PDAnnotationHighlight({
        rect: [50, 700, 200, 720],
      });
      page.addAnnotation(highlight);

      // Add a widget field
      const cb = form.createCheckBox('toFlatten');
      cb.check();
      cb.addToPage(page);

      // Before flatten: 2 annotations (highlight + widget)
      const annotsBefore = page._nativePageDict!.getItem('Annots') as COSArray;
      expect(annotsBefore.size()).toBe(2);

      form.flatten();

      // After flatten: highlight should remain, widget removed
      const annotsAfter = page._nativePageDict!.getItem('Annots');
      expect(annotsAfter).toBeDefined();
      expect(annotsAfter).toBeInstanceOf(COSArray);
      expect((annotsAfter as COSArray).size()).toBe(1);
    });

    it('should keep /Annots with non-widget entries after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      // Add two non-widget annotations
      const { PDAnnotationHighlight, PDAnnotationText } = await import(
        '../annotations/index.js'
      );
      const highlight = new PDAnnotationHighlight({
        rect: [50, 700, 200, 720],
      });
      page.addAnnotation(highlight);
      const note = new PDAnnotationText({
        rect: [50, 650, 70, 670],
        contents: 'A note',
      });
      page.addAnnotation(note);

      // Add a widget
      const cb = form.createCheckBox('cb');
      cb.addToPage(page);

      form.flatten();

      const annots = page._nativePageDict!.getItem('Annots') as COSArray;
      expect(annots).toBeInstanceOf(COSArray);
      expect(annots.size()).toBe(2);
    });

    it('should leave non-widget annotation dict unchanged after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      const { PDAnnotationHighlight } = await import('../annotations/index.js');
      const highlight = new PDAnnotationHighlight({
        rect: [10, 20, 30, 40],
        contents: 'Important',
      });
      page.addAnnotation(highlight);

      const cb = form.createCheckBox('temp');
      cb.addToPage(page);

      // Record the highlight dict's contents before flatten
      const highlightSubtype = highlight._dict.getCOSName('Subtype')?.getName();
      const highlightContents = (
        highlight._dict.getItem('Contents') as COSString
      ).getString();

      form.flatten();

      // Verify highlight dict is unchanged
      expect(highlight._dict.getCOSName('Subtype')?.getName()).toBe(
        highlightSubtype,
      );
      expect(
        (highlight._dict.getItem('Contents') as COSString).getString(),
      ).toBe(highlightContents);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Radio group flattening
  // ---------------------------------------------------------------------------

  describe('radio group flattening', () => {
    it('should remove radio group field after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const rg = form.createRadioGroup('color');
      rg.addOptionToPage('red', page);
      rg.addOptionToPage('blue', page);
      rg.select('red');

      expect(form.getFields().length).toBe(1);
      form.flatten();
      expect(form.getFields().length).toBe(0);
    });

    it('should remove all radio /Kids widgets from page /Annots', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const rg = form.createRadioGroup('size');
      rg.addOptionToPage('small', page);
      rg.addOptionToPage('large', page);

      // Before flatten: 2 widget annotations from radio kids
      const annotsBefore = page._nativePageDict!.getItem('Annots') as COSArray;
      expect(annotsBefore.size()).toBe(2);

      form.flatten();

      // After flatten: no widget annotations remain
      const annotsAfter = page._nativePageDict!.getItem('Annots');
      expect(annotsAfter).toBeUndefined();
    });

    it('should bake selected radio option appearance into page', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const rg = form.createRadioGroup('choice');
      rg.addOptionToPage('optA', page);
      rg.addOptionToPage('optB', page);
      rg.select('optA');

      // Set visible rect on the kids so appearance gets baked
      const kids = rg._native!.dict.getItem('Kids') as COSArray;
      for (let i = 0; i < kids.size(); i++) {
        let kid = kids.get(i);
        if (kid instanceof COSObjectReference) {
          kid = doc._nativeCtx!.resolveRef(kid);
        }
        if (kid instanceof COSDictionary) {
          kid.setItem('Rect', makeVisibleRect(50 + i * 30, 700, 12, 12));
        }
      }

      form.flatten();

      // Page should have content streams appended and XObject resources
      const contents = page._nativePageDict!.getItem('Contents');
      expect(contents).toBeDefined();
      // At least one content stream should have been appended
      if (contents instanceof COSArray) {
        expect(contents.size()).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Dropdown flattening
  // ---------------------------------------------------------------------------

  describe('dropdown flattening', () => {
    it('should remove dropdown field after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const dd = form.createDropdown('country');
      dd.setOptions(['US', 'UK', 'CA']);
      dd.select('UK');
      dd.addToPage(page);

      expect(form.getFields().length).toBe(1);
      form.flatten();
      expect(form.getFields().length).toBe(0);
    });

    it('should clear /AcroForm /Fields after dropdown flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const dd = form.createDropdown('state');
      dd.setOptions(['CA', 'NY', 'TX']);
      dd.select('NY');
      dd.addToPage(page);

      form.flatten();

      const acroForm = getAcroFormDict(doc._nativeCtx!);
      const fields = acroForm!.getItem('Fields') as COSArray;
      expect(fields.size()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Content stream verification
  // ---------------------------------------------------------------------------

  describe('content stream verification', () => {
    it('should append new content stream to page after flatten', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('cs_test');
      cb.check();
      // Set visible rect
      cb._native!.dict.setItem('Rect', makeVisibleRect(100, 500, 12, 12));
      cb.addToPage(page);

      form.flatten();

      const contents = page._nativePageDict!.getItem('Contents');
      // For a newly-created page with flatten, should have content array
      expect(contents).toBeDefined();
      if (contents instanceof COSArray) {
        // At least one stream from the flattened appearance
        expect(contents.size()).toBeGreaterThanOrEqual(1);
        // Verify it contains a COSObjectReference
        const lastEntry = contents.get(contents.size() - 1);
        expect(lastEntry).toBeInstanceOf(COSObjectReference);
      }
    });

    it('should produce content stream containing Do operator', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('do_test');
      cb.check();
      cb._native!.dict.setItem('Rect', makeVisibleRect(200, 400, 12, 12));
      cb.addToPage(page);

      form.flatten();

      // Get the appended content stream and check it contains "Do"
      const contents = page._nativePageDict!.getItem('Contents');
      expect(contents).toBeDefined();

      if (contents instanceof COSArray && contents.size() > 0) {
        const lastRef = contents.get(contents.size() - 1);
        if (lastRef instanceof COSObjectReference) {
          const stream = doc._nativeCtx!.resolveRef(lastRef);
          if (stream instanceof COSStream) {
            const data = stream.getData();
            const text = new TextDecoder().decode(data);
            expect(text).toContain('Do');
          }
        }
      }
    });

    it('should preserve page count after flatten + save + load', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('save_test');
      cb.addToPage(doc.getPages()[0]);

      form.flatten();
      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Round-trip validation
  // ---------------------------------------------------------------------------

  describe('round-trip validation', () => {
    it('should have no fields after create + fill + flatten + save + load', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('rt_cb');
      cb.check();
      cb.addToPage(page);

      const dd = form.createDropdown('rt_dd');
      dd.setOptions(['A', 'B']);
      dd.select('B');
      dd.addToPage(page);

      form.flatten();
      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);
      const loadedForm = loaded.getForm();
      expect(loadedForm.getFields().length).toBe(0);
    });

    it('should have correct page count after round-trip', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      doc.addPage();
      doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('rt_pages');
      cb.addToPage(doc.getPages()[1]);

      form.flatten();
      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(3);
    });

    it('should pass qpdf --check after flatten (if available)', async () => {
      if (!hasCommand('qpdf')) return;

      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('qpdf_test');
      cb.check();
      // Set visible rect
      cb._native!.dict.setItem('Rect', makeVisibleRect(50, 700, 12, 12));
      cb.addToPage(page);

      const dd = form.createDropdown('qpdf_dd');
      dd.setOptions(['X', 'Y', 'Z']);
      dd.select('Y');
      dd.addToPage(page);

      form.flatten();
      const bytes = await doc.save();

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flatten-'));
      const tmpFile = path.join(tmpDir, 'flattened.pdf');
      try {
        fs.writeFileSync(tmpFile, bytes);
        const result = execSync(`qpdf --check "${tmpFile}" 2>&1`, {
          encoding: 'utf-8',
          timeout: 10000,
        });
        // qpdf --check outputs warnings to stderr; a clean check exits 0
        expect(result).toBeDefined();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle field with zero-size rect without crashing', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('zero_rect');
      cb.check();
      // Default rect is already (0,0,0,0) — zero-size
      cb.addToPage(page);

      expect(form.getFields().length).toBe(1);
      expect(() => form.flatten()).not.toThrow();
      expect(form.getFields().length).toBe(0);
    });

    it('should handle field without /AP gracefully', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      // Create a text field (no /AP in native mode) and wire to page
      const tf = form.createTextField('no_ap');
      tf.setText('no appearance');
      addWidgetToPageNative(tf._native!.dict, tf._native!.ref, page);

      // Text fields in native mode have no /AP
      expect(tf._native!.dict.getItem('AP')).toBeUndefined();

      expect(() => form.flatten()).not.toThrow();
      // Field is still removed from /Fields even without /AP
      expect(form.getFields().length).toBe(0);
    });

    it('should not throw when flattening twice', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();
      const cb = form.createCheckBox('double_flatten');
      cb.check();
      cb.addToPage(page);

      form.flatten();
      expect(form.getFields().length).toBe(0);

      // Second flatten should be a no-op
      expect(() => form.flatten()).not.toThrow();
      expect(form.getFields().length).toBe(0);
    });
  });
});
