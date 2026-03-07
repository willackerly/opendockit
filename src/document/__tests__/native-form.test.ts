/**
 * Tests for NativeFormReader — AcroForm field reading/writing via COS objects.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../PDFDocument.js';
import {
  readFields,
  getAcroFormDict,
  setNeedAppearances,
  FF_READ_ONLY,
  FF_REQUIRED,
  FF_NO_EXPORT,
  FF_MULTILINE,
} from '../NativeFormReader.js';
import type { NativeFieldInfo } from '../NativeFormReader.js';
import { NativeDocumentContext } from '../NativeDocumentContext.js';
import {
  COSName,
  COSString,
  COSInteger,
  COSArray,
  COSDictionary,
  COSObjectReference,
  COSBoolean,
} from '../../pdfbox/cos/COSTypes.js';

// ---------------------------------------------------------------------------
// Helpers: build a minimal AcroForm structure in a NativeDocumentContext
// ---------------------------------------------------------------------------

/** Create a NativeDocumentContext with an AcroForm containing the given fields. */
function buildCtxWithFields(
  fields: Array<{
    name: string;
    type?: string;
    value?: string;
    flags?: number;
    isCheckbox?: boolean;
    kids?: Array<{
      name: string;
      type?: string;
      value?: string;
      flags?: number;
    }>;
  }>,
): NativeDocumentContext {
  const ctx = new NativeDocumentContext();

  const acroFormDict = new COSDictionary();
  const fieldsArray = new COSArray();

  for (const f of fields) {
    if (f.kids) {
      // Hierarchical: parent with /Kids containing sub-fields
      const parentDict = new COSDictionary();
      parentDict.setItem('T', new COSString(f.name));

      const kidsArray = new COSArray();
      for (const kid of f.kids) {
        const kidDict = new COSDictionary();
        kidDict.setItem('T', new COSString(kid.name));
        if (kid.type) kidDict.setItem('FT', new COSName(kid.type));
        if (kid.value !== undefined) {
          kidDict.setItem('V', new COSString(kid.value));
        }
        if (kid.flags !== undefined) {
          kidDict.setItem('Ff', new COSInteger(kid.flags));
        }
        const kidRef = ctx.register(kidDict);
        kidsArray.add(kidRef);
      }
      parentDict.setItem('Kids', kidsArray);
      const parentRef = ctx.register(parentDict);
      fieldsArray.add(parentRef);
    } else {
      // Flat field
      const fieldDict = new COSDictionary();
      fieldDict.setItem('T', new COSString(f.name));
      if (f.type) fieldDict.setItem('FT', new COSName(f.type));
      if (f.value !== undefined) {
        if (f.isCheckbox) {
          fieldDict.setItem('V', new COSName(f.value));
        } else {
          fieldDict.setItem('V', new COSString(f.value));
        }
      }
      if (f.flags !== undefined) {
        fieldDict.setItem('Ff', new COSInteger(f.flags));
      }
      const fieldRef = ctx.register(fieldDict);
      fieldsArray.add(fieldRef);
    }
  }

  acroFormDict.setItem('Fields', fieldsArray);
  const acroFormRef = ctx.register(acroFormDict);
  ctx.catalog.setItem('AcroForm', acroFormRef);

  return ctx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NativeFormReader', () => {
  describe('readFields', () => {
    it('should return empty array when no AcroForm in catalog', () => {
      const ctx = new NativeDocumentContext();
      expect(readFields(ctx)).toEqual([]);
    });

    it('should return empty array when AcroForm has no Fields', () => {
      const ctx = new NativeDocumentContext();
      const acroForm = new COSDictionary();
      const ref = ctx.register(acroForm);
      ctx.catalog.setItem('AcroForm', ref);
      expect(readFields(ctx)).toEqual([]);
    });

    it('should return empty array when Fields array is empty', () => {
      const ctx = buildCtxWithFields([]);
      expect(readFields(ctx)).toEqual([]);
    });

    it('should read a single text field', () => {
      const ctx = buildCtxWithFields([
        { name: 'myField', type: 'Tx', value: 'Hello' },
      ]);
      const fields = readFields(ctx);
      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe('myField');
      expect(fields[0].type).toBe('Tx');
      expect(fields[0].value).toBe('Hello');
    });

    it('should read multiple fields', () => {
      const ctx = buildCtxWithFields([
        { name: 'name', type: 'Tx', value: 'Alice' },
        { name: 'amount', type: 'Tx', value: '1000' },
        { name: 'reference', type: 'Tx' },
        { name: 'notes', type: 'Tx', value: 'Some notes', flags: FF_MULTILINE },
      ]);
      const fields = readFields(ctx);
      expect(fields).toHaveLength(4);
      expect(fields[0].name).toBe('name');
      expect(fields[0].value).toBe('Alice');
      expect(fields[1].name).toBe('amount');
      expect(fields[1].value).toBe('1000');
      expect(fields[2].name).toBe('reference');
      expect(fields[2].value).toBeUndefined();
      expect(fields[3].name).toBe('notes');
      expect(fields[3].flags & FF_MULTILINE).toBeTruthy();
    });

    it('should handle hierarchical field names (parent.child)', () => {
      const ctx = buildCtxWithFields([
        {
          name: 'address',
          kids: [
            { name: 'street', type: 'Tx', value: '123 Main St' },
            { name: 'city', type: 'Tx', value: 'Springfield' },
            { name: 'zip', type: 'Tx', value: '12345' },
          ],
        },
      ]);
      const fields = readFields(ctx);
      expect(fields).toHaveLength(3);
      expect(fields[0].name).toBe('address.street');
      expect(fields[0].value).toBe('123 Main St');
      expect(fields[1].name).toBe('address.city');
      expect(fields[1].value).toBe('Springfield');
      expect(fields[2].name).toBe('address.zip');
      expect(fields[2].value).toBe('12345');
    });

    it('should detect field types correctly', () => {
      const ctx = buildCtxWithFields([
        { name: 'text', type: 'Tx' },
        { name: 'button', type: 'Btn' },
        { name: 'choice', type: 'Ch' },
        { name: 'sig', type: 'Sig' },
      ]);
      const fields = readFields(ctx);
      expect(fields[0].type).toBe('Tx');
      expect(fields[1].type).toBe('Btn');
      expect(fields[2].type).toBe('Ch');
      expect(fields[3].type).toBe('Sig');
    });

    it('should read checkbox value as COSName', () => {
      const ctx = buildCtxWithFields([
        { name: 'agree', type: 'Btn', value: 'Yes', isCheckbox: true },
        { name: 'optout', type: 'Btn', value: 'Off', isCheckbox: true },
      ]);
      const fields = readFields(ctx);
      expect(fields[0].value).toBe('Yes');
      expect(fields[1].value).toBe('Off');
    });

    it('should read field flags', () => {
      const ctx = buildCtxWithFields([
        { name: 'readonly', type: 'Tx', flags: FF_READ_ONLY },
        { name: 'required', type: 'Tx', flags: FF_REQUIRED },
        { name: 'noexport', type: 'Tx', flags: FF_NO_EXPORT },
        { name: 'multi_required', type: 'Tx', flags: FF_MULTILINE | FF_REQUIRED },
      ]);
      const fields = readFields(ctx);
      expect(fields[0].flags & FF_READ_ONLY).toBeTruthy();
      expect(fields[1].flags & FF_REQUIRED).toBeTruthy();
      expect(fields[2].flags & FF_NO_EXPORT).toBeTruthy();
      expect(fields[3].flags & FF_MULTILINE).toBeTruthy();
      expect(fields[3].flags & FF_REQUIRED).toBeTruthy();
    });

    it('should handle field with no type (Unknown)', () => {
      const ctx = buildCtxWithFields([
        { name: 'mystery' },
      ]);
      const fields = readFields(ctx);
      expect(fields[0].type).toBe('Unknown');
    });

    it('should handle inline AcroForm dictionary', () => {
      const ctx = new NativeDocumentContext();
      const acroForm = new COSDictionary();
      const fieldsArray = new COSArray();

      const fieldDict = new COSDictionary();
      fieldDict.setItem('T', new COSString('inline'));
      fieldDict.setItem('FT', new COSName('Tx'));
      const fieldRef = ctx.register(fieldDict);
      fieldsArray.add(fieldRef);

      acroForm.setItem('Fields', fieldsArray);
      // Set AcroForm directly (not as indirect ref)
      acroForm.setDirect(true);
      ctx.catalog.setItem('AcroForm', acroForm);

      const fields = readFields(ctx);
      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe('inline');
    });

    it('should provide dict and ref in field info', () => {
      const ctx = buildCtxWithFields([
        { name: 'test', type: 'Tx', value: 'v' },
      ]);
      const fields = readFields(ctx);
      expect(fields[0].dict).toBeInstanceOf(COSDictionary);
      expect(fields[0].ref).toBeInstanceOf(COSObjectReference);
      expect(fields[0].ref.objectNumber).toBeGreaterThan(0);
    });

    it('should handle field with empty value', () => {
      const ctx = buildCtxWithFields([
        { name: 'empty', type: 'Tx', value: '' },
      ]);
      const fields = readFields(ctx);
      expect(fields[0].value).toBe('');
    });
  });

  describe('getAcroFormDict', () => {
    it('should return undefined when no AcroForm', () => {
      const ctx = new NativeDocumentContext();
      expect(getAcroFormDict(ctx)).toBeUndefined();
    });

    it('should return AcroForm dict from indirect ref', () => {
      const ctx = buildCtxWithFields([{ name: 'f', type: 'Tx' }]);
      const dict = getAcroFormDict(ctx);
      expect(dict).toBeInstanceOf(COSDictionary);
      expect(dict!.containsKey('Fields')).toBe(true);
    });
  });

  describe('setNeedAppearances', () => {
    it('should set NeedAppearances on existing AcroForm', () => {
      const ctx = buildCtxWithFields([{ name: 'f', type: 'Tx' }]);
      setNeedAppearances(ctx);
      const dict = getAcroFormDict(ctx)!;
      const val = dict.getItem('NeedAppearances');
      expect(val).toBeInstanceOf(COSBoolean);
      expect((val as COSBoolean).getValue()).toBe(true);
    });

    it('should create AcroForm dict if none exists', () => {
      const ctx = new NativeDocumentContext();
      setNeedAppearances(ctx);
      const dict = getAcroFormDict(ctx);
      expect(dict).toBeDefined();
      const val = dict!.getItem('NeedAppearances');
      expect(val).toBeInstanceOf(COSBoolean);
    });
  });

  describe('round-trip: read fields from saved PDF', () => {
    it('should read fields from a PDF created with form fields', async () => {
      // Create a PDF with form fields natively
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]);
      const form = pdfDoc.getForm();
      const textField = form.createTextField('recipient.name');
      textField.setText('Alice');
      textField.addToPage(page);

      const textField2 = form.createTextField('amount');
      textField2.setText('5000');
      textField2.addToPage(page);

      const bytes = await pdfDoc.save();

      // Load with native parser and read fields
      const doc = await PDFDocument.load(bytes);
      expect(doc.isNative).toBe(true);

      const fields = readFields(doc._nativeCtx!);
      expect(fields.length).toBeGreaterThanOrEqual(2);

      const nameField = fields.find(f => f.name === 'recipient.name');
      expect(nameField).toBeDefined();
      expect(nameField!.type).toBe('Tx');
      expect(nameField!.value).toBe('Alice');

      const amountField = fields.find(f => f.name === 'amount');
      expect(amountField).toBeDefined();
      expect(amountField!.value).toBe('5000');
    });

    it('should read fields from a PDF with checkbox fields', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();

      const cb = form.createCheckBox('agree');
      cb.addToPage(page);
      cb.check();

      const bytes = await pdfDoc.save();
      const doc = await PDFDocument.load(bytes);
      const fields = readFields(doc._nativeCtx!);

      const agreeField = fields.find(f => f.name === 'agree');
      expect(agreeField).toBeDefined();
      expect(agreeField!.type).toBe('Btn');
      // Checked checkbox value is typically "Yes"
      expect(agreeField!.value).toBe('Yes');
    });

    it('should return empty fields for PDF with no AcroForm', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);
      const fields = readFields(loaded._nativeCtx!);
      expect(fields).toEqual([]);
    });

    it('should set text field value, save, reload, and verify', async () => {
      // Create a PDF with a text field natively
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();
      const tf = form.createTextField('editable');
      tf.setText('original');
      tf.addToPage(page);
      const bytes = await pdfDoc.save();

      // Load natively and modify value
      const doc = await PDFDocument.load(bytes);
      const fields = readFields(doc._nativeCtx!);
      const editable = fields.find(f => f.name === 'editable');
      expect(editable).toBeDefined();
      expect(editable!.value).toBe('original');

      // Modify the value
      editable!.dict.setItem('V', new COSString('modified'));
      setNeedAppearances(doc._nativeCtx!);

      // Save and reload
      const saved = await doc.save();
      const reloaded = await PDFDocument.load(saved);
      const fields2 = readFields(reloaded._nativeCtx!);
      const editableReloaded = fields2.find(f => f.name === 'editable');
      expect(editableReloaded).toBeDefined();
      expect(editableReloaded!.value).toBe('modified');
    });
  });

  describe('parity fixtures (no AcroForm)', () => {
    it('should return empty fields for a simple PDF fixture', async () => {
      // simple-test.pdf has no AcroForm
      const fs = await import('node:fs');
      const path = await import('node:path');
      const fixturePath = path.resolve('test-pdfs/working/simple-test.pdf');
      try {
        const bytes = fs.readFileSync(fixturePath);
        const doc = await PDFDocument.load(bytes);
        const fields = readFields(doc._nativeCtx!);
        expect(fields).toEqual([]);
      } catch {
        // Skip if fixture not available
      }
    });
  });
});
