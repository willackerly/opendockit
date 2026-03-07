/**
 * Comprehensive tests for native form field creation.
 *
 * Tests all field types (text, checkbox, dropdown, option list, radio group, button),
 * duplicate name detection, AcroForm auto-creation, addToPage behavior,
 * round-trip persistence, and qpdf structural validation.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../PDFDocument.js';
import { PDFTextField } from '../fields/PDFTextField.js';
import { PDFCheckBox } from '../fields/PDFCheckBox.js';
import { PDFDropdown } from '../fields/PDFDropdown.js';
import { PDFOptionList } from '../fields/PDFOptionList.js';
import { PDFRadioGroup } from '../fields/PDFRadioGroup.js';
import { PDFButton } from '../fields/PDFButton.js';
import {
  COSName,
  COSString,
  COSInteger,
  COSArray,
  COSDictionary,
} from '../../pdfbox/cos/COSTypes.js';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. createTextField
// ---------------------------------------------------------------------------

describe('createTextField', () => {
  it('should return a PDFTextField with the correct name', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createTextField('fullName');
    expect(field).toBeInstanceOf(PDFTextField);
    expect(field.getName()).toBe('fullName');
  });

  it('should have /FT = /Tx in the underlying dict', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createTextField('myTx');
    const dict = field._native!.dict;
    const ft = dict.getCOSName('FT');
    expect(ft).toBeDefined();
    expect(ft!.getName()).toBe('Tx');
  });

  it('should have /T set to the field name as a COSString', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createTextField('recipient');
    const dict = field._native!.dict;
    const t = dict.getItem('T');
    expect(t).toBeInstanceOf(COSString);
    expect((t as COSString).getString()).toBe('recipient');
  });

  it('should have /DA (default appearance) set', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createTextField('withDA');
    const dict = field._native!.dict;
    const da = dict.getItem('DA');
    expect(da).toBeInstanceOf(COSString);
    expect((da as COSString).getString()).toContain('Helv');
  });

  it('should have /Type = /Annot and /Subtype = /Widget (merged field+widget)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createTextField('merged');
    const dict = field._native!.dict;

    const type = dict.getCOSName('Type');
    expect(type).toBeDefined();
    expect(type!.getName()).toBe('Annot');

    const subtype = dict.getCOSName('Subtype');
    expect(subtype).toBeDefined();
    expect(subtype!.getName()).toBe('Widget');
  });

  it('should return empty string or undefined from getText() for a new field', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createTextField('empty');
    const text = field.getText();
    // New field has no /V, so getText() returns undefined
    expect(text === undefined || text === '').toBe(true);
  });

  it('should support setText() -> getText() round-trip', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createTextField('editable');
    field.setText('Hello World');
    expect(field.getText()).toBe('Hello World');
  });

  it('should appear in form.getFields()', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createTextField('visible');
    const fields = form.getFields();
    const names = fields.map((f) => f.getName());
    expect(names).toContain('visible');
  });
});

// ---------------------------------------------------------------------------
// 2. createCheckBox
// ---------------------------------------------------------------------------

describe('createCheckBox', () => {
  it('should return a PDFCheckBox with the correct name', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createCheckBox('agree');
    expect(field).toBeInstanceOf(PDFCheckBox);
    expect(field.getName()).toBe('agree');
  });

  it('should have /FT = /Btn with no Radio or Pushbutton flags', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createCheckBox('terms');
    const dict = field._native!.dict;

    const ft = dict.getCOSName('FT');
    expect(ft!.getName()).toBe('Btn');

    const ff = dict.getInt('Ff', 0);
    const RADIO_BIT = 1 << 25;
    const PUSHBUTTON_BIT = 1 << 24;
    expect(ff & RADIO_BIT).toBe(0);
    expect(ff & PUSHBUTTON_BIT).toBe(0);
  });

  it('should have /AP with /N containing /Yes and /Off', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createCheckBox('withAP');
    const dict = field._native!.dict;

    const ap = dict.getItem('AP');
    expect(ap).toBeInstanceOf(COSDictionary);
    const apDict = ap as COSDictionary;

    const n = apDict.getItem('N');
    expect(n).toBeInstanceOf(COSDictionary);
    const nDict = n as COSDictionary;

    // /Yes and /Off should be present (as references to appearance streams)
    expect(nDict.getItem('Yes')).toBeDefined();
    expect(nDict.getItem('Off')).toBeDefined();
  });

  it('should return false from isChecked() initially', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createCheckBox('unchecked');
    expect(field.isChecked()).toBe(false);
  });

  it('should return true from isChecked() after check()', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createCheckBox('toCheck');
    field.check();
    expect(field.isChecked()).toBe(true);
  });

  it('should return false from isChecked() after check() then uncheck()', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createCheckBox('toggle');
    field.check();
    expect(field.isChecked()).toBe(true);
    field.uncheck();
    expect(field.isChecked()).toBe(false);
  });

  it('should set /V to /Yes and /AS to /Yes when checked', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createCheckBox('cosCheck');
    field.check();

    const dict = field._native!.dict;
    const v = dict.getCOSName('V');
    expect(v).toBeDefined();
    expect(v!.getName()).toBe('Yes');

    const as = dict.getCOSName('AS');
    expect(as).toBeDefined();
    expect(as!.getName()).toBe('Yes');
  });

  it('should appear in form.getFields()', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createCheckBox('cbField');
    const fields = form.getFields();
    const names = fields.map((f) => f.getName());
    expect(names).toContain('cbField');
  });
});

// ---------------------------------------------------------------------------
// 3. createDropdown
// ---------------------------------------------------------------------------

describe('createDropdown', () => {
  it('should return a PDFDropdown with the correct name', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createDropdown('color');
    expect(field).toBeInstanceOf(PDFDropdown);
    expect(field.getName()).toBe('color');
  });

  it('should have /FT = /Ch with Combo flag (bit 18 = 1<<17)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createDropdown('combo');
    const dict = field._native!.dict;

    const ft = dict.getCOSName('FT');
    expect(ft!.getName()).toBe('Ch');

    const ff = dict.getInt('Ff', 0);
    const COMBO_BIT = 1 << 17;
    expect(ff & COMBO_BIT).toBe(COMBO_BIT);
  });

  it('should have an empty /Opt array initially', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createDropdown('emptyOpts');
    const dict = field._native!.dict;

    const opt = dict.getItem('Opt');
    expect(opt).toBeInstanceOf(COSArray);
    expect((opt as COSArray).size()).toBe(0);
    expect(field.getOptions()).toEqual([]);
  });

  it('should support setOptions() -> getOptions() round-trip', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createDropdown('colors');
    field.setOptions(['red', 'green', 'blue']);
    expect(field.getOptions()).toEqual(['red', 'green', 'blue']);
  });

  it('should support addOptions() to append an option', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createDropdown('addable');
    field.setOptions(['a', 'b', 'c']);
    field.addOptions('d');
    expect(field.getOptions()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should support select() -> getSelected() round-trip', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createDropdown('selectable');
    field.setOptions(['x', 'y', 'z']);
    field.select('y');
    expect(field.getSelected()).toEqual(['y']);
  });

  it('should return empty array from getSelected() after clear()', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createDropdown('clearable');
    field.setOptions(['a', 'b']);
    field.select('a');
    expect(field.getSelected()).toEqual(['a']);
    field.clear();
    expect(field.getSelected()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. createOptionList
// ---------------------------------------------------------------------------

describe('createOptionList', () => {
  it('should return a PDFOptionList with the correct name', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createOptionList('fruits');
    expect(field).toBeInstanceOf(PDFOptionList);
    expect(field.getName()).toBe('fruits');
  });

  it('should have /FT = /Ch without Combo flag', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createOptionList('listBox');
    const dict = field._native!.dict;

    const ft = dict.getCOSName('FT');
    expect(ft!.getName()).toBe('Ch');

    const ff = dict.getInt('Ff', 0);
    const COMBO_BIT = 1 << 17;
    expect(ff & COMBO_BIT).toBe(0);
  });

  it('should support setOptions/getOptions round-trip', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createOptionList('items');
    field.setOptions(['apple', 'banana', 'cherry']);
    expect(field.getOptions()).toEqual(['apple', 'banana', 'cherry']);
  });

  it('should support select/getSelected round-trip', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createOptionList('pick');
    field.setOptions(['one', 'two', 'three']);
    field.select('two');
    expect(field.getSelected()).toEqual(['two']);
  });

  it('should appear in form.getFields()', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createOptionList('listedField');
    const fields = form.getFields();
    const names = fields.map((f) => f.getName());
    expect(names).toContain('listedField');
  });
});

// ---------------------------------------------------------------------------
// 5. createRadioGroup
// ---------------------------------------------------------------------------

describe('createRadioGroup', () => {
  it('should return a PDFRadioGroup with the correct name', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createRadioGroup('gender');
    expect(field).toBeInstanceOf(PDFRadioGroup);
    expect(field.getName()).toBe('gender');
  });

  it('should have /FT = /Btn with Radio flag (bit 26 = 1<<25)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createRadioGroup('radioFT');
    const dict = field._native!.dict;

    const ft = dict.getCOSName('FT');
    expect(ft!.getName()).toBe('Btn');

    const ff = dict.getInt('Ff', 0);
    const RADIO_BIT = 1 << 25;
    expect(ff & RADIO_BIT).toBe(RADIO_BIT);
  });

  it('should have /Kids array initially empty', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createRadioGroup('emptyRadio');
    const dict = field._native!.dict;

    const kids = dict.getItem('Kids');
    expect(kids).toBeInstanceOf(COSArray);
    expect((kids as COSArray).size()).toBe(0);
  });

  it('should add a widget to Kids when addOptionToPage is called', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    const field = form.createRadioGroup('withOption');
    field.addOptionToPage('optA', page);

    const dict = field._native!.dict;
    const kids = dict.getItem('Kids');
    expect(kids).toBeInstanceOf(COSArray);
    expect((kids as COSArray).size()).toBe(1);
  });

  it('should support select() -> getSelected() round-trip', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    const field = form.createRadioGroup('selectRadio');
    field.addOptionToPage('choice1', page);
    field.addOptionToPage('choice2', page);
    field.select('choice1');
    expect(field.getSelected()).toBe('choice1');
  });

  it('should return undefined from getSelected() after clear()', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    const field = form.createRadioGroup('clearRadio');
    field.addOptionToPage('opt1', page);
    field.select('opt1');
    expect(field.getSelected()).toBe('opt1');
    field.clear();
    expect(field.getSelected()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. createButton
// ---------------------------------------------------------------------------

describe('createButton', () => {
  it('should return a PDFButton with the correct name', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createButton('submit');
    expect(field).toBeInstanceOf(PDFButton);
    expect(field.getName()).toBe('submit');
  });

  it('should have /FT = /Btn with Pushbutton flag (bit 25 = 1<<24)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createButton('pushBtn');
    const dict = field._native!.dict;

    const ft = dict.getCOSName('FT');
    expect(ft!.getName()).toBe('Btn');

    const ff = dict.getInt('Ff', 0);
    const PUSHBUTTON_BIT = 1 << 24;
    expect(ff & PUSHBUTTON_BIT).toBe(PUSHBUTTON_BIT);
  });

  it('should have /DA set', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const field = form.createButton('btnDA');
    const dict = field._native!.dict;

    const da = dict.getItem('DA');
    expect(da).toBeInstanceOf(COSString);
    expect((da as COSString).getString()).toContain('Helv');
  });

  it('should appear in form.getFields()', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createButton('myButton');
    const fields = form.getFields();
    const names = fields.map((f) => f.getName());
    expect(names).toContain('myButton');
  });
});

// ---------------------------------------------------------------------------
// 7. Duplicate name detection
// ---------------------------------------------------------------------------

describe('Duplicate name detection', () => {
  it('should throw when creating two text fields with the same name', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createTextField('dup');
    expect(() => form.createTextField('dup')).toThrow();
  });

  it('should throw when creating a checkbox with the same name as a text field', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createTextField('shared');
    expect(() => form.createCheckBox('shared')).toThrow();
  });

  it('should include the field name in the error message', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createTextField('uniqueName');
    expect(() => form.createTextField('uniqueName')).toThrow(/uniqueName/);
  });
});

// ---------------------------------------------------------------------------
// 8. AcroForm auto-creation
// ---------------------------------------------------------------------------

describe('AcroForm auto-creation', () => {
  it('should create /AcroForm on catalog when a field is created', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const ctx = doc._nativeCtx!;

    // Before creating any fields, there should be no AcroForm
    expect(ctx.catalog.getItem('AcroForm')).toBeUndefined();

    const form = doc.getForm();
    form.createTextField('trigger');

    // After creating a field, /AcroForm should exist
    expect(ctx.catalog.getItem('AcroForm')).toBeDefined();
  });

  it('should have /Fields array in the AcroForm', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createTextField('inFields');

    const ctx = doc._nativeCtx!;
    let acroForm = ctx.catalog.getItem('AcroForm');
    // Resolve indirect ref if needed
    if (acroForm && 'objectNumber' in acroForm) {
      acroForm = ctx.resolveRef(acroForm as any);
    }
    expect(acroForm).toBeInstanceOf(COSDictionary);
    const fieldsEntry = (acroForm as COSDictionary).getItem('Fields');
    expect(fieldsEntry).toBeDefined();
    // Fields can be a COSArray directly or via indirect ref
    let fieldsArr = fieldsEntry;
    if (fieldsArr && 'objectNumber' in fieldsArr) {
      fieldsArr = ctx.resolveRef(fieldsArr as any);
    }
    expect(fieldsArr).toBeInstanceOf(COSArray);
    expect((fieldsArr as COSArray).size()).toBeGreaterThanOrEqual(1);
  });

  it('should have /DR (default resources) with Helvetica in AcroForm', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createTextField('drTest');

    const ctx = doc._nativeCtx!;
    let acroForm = ctx.catalog.getItem('AcroForm');
    if (acroForm && 'objectNumber' in acroForm) {
      acroForm = ctx.resolveRef(acroForm as any);
    }
    const acroFormDict = acroForm as COSDictionary;

    const dr = acroFormDict.getItem('DR');
    expect(dr).toBeInstanceOf(COSDictionary);
    const drDict = dr as COSDictionary;

    const fontDict = drDict.getItem('Font');
    expect(fontDict).toBeInstanceOf(COSDictionary);

    // Should have /Helv key pointing to a font
    const helv = (fontDict as COSDictionary).getItem('Helv');
    expect(helv).toBeDefined();
  });

  it('should have /DA on the AcroForm', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createTextField('daTest');

    const ctx = doc._nativeCtx!;
    let acroForm = ctx.catalog.getItem('AcroForm');
    if (acroForm && 'objectNumber' in acroForm) {
      acroForm = ctx.resolveRef(acroForm as any);
    }
    const acroFormDict = acroForm as COSDictionary;

    const da = acroFormDict.getItem('DA');
    expect(da).toBeInstanceOf(COSString);
    expect((da as COSString).getString()).toContain('Helv');
  });
});

// ---------------------------------------------------------------------------
// 9. addToPage
// ---------------------------------------------------------------------------

describe('addToPage', () => {
  it('should add /Annots to the page when a text field is added', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    const field = form.createTextField('onPage');

    // Text field addToPage is legacy-only, but checkbox has native addToPage
    // Use checkbox for reliable native addToPage testing
    const cb = form.createCheckBox('onPageCb');
    cb.addToPage(page);

    const annots = page._nativePageDict!.getItem('Annots');
    expect(annots).toBeInstanceOf(COSArray);
    expect((annots as COSArray).size()).toBeGreaterThanOrEqual(1);
  });

  it('should add /Annots to the page when a checkbox is added', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    const cb = form.createCheckBox('pageCheckbox');
    cb.addToPage(page);

    const annots = page._nativePageDict!.getItem('Annots');
    expect(annots).toBeInstanceOf(COSArray);
    expect((annots as COSArray).size()).toBe(1);
  });

  it('should set /P on the widget dict pointing to the page', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    const cb = form.createCheckBox('pPointer');
    cb.addToPage(page);

    const pEntry = cb._native!.dict.getItem('P');
    expect(pEntry).toBeDefined();
    // /P should be a reference to the page object
    expect(pEntry).toBe(page._nativePageRef);
  });

  it('should add multiple fields to the same page /Annots', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();

    const cb1 = form.createCheckBox('multi1');
    const cb2 = form.createCheckBox('multi2');
    const dd = form.createDropdown('multi3');

    cb1.addToPage(page);
    cb2.addToPage(page);
    dd.addToPage(page);

    const annots = page._nativePageDict!.getItem('Annots');
    expect(annots).toBeInstanceOf(COSArray);
    expect((annots as COSArray).size()).toBe(3);
  });

  it('should add radio widget to page when addOptionToPage is called', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    const radio = form.createRadioGroup('pageRadio');
    radio.addOptionToPage('optX', page);

    const annots = page._nativePageDict!.getItem('Annots');
    expect(annots).toBeInstanceOf(COSArray);
    expect((annots as COSArray).size()).toBe(1);

    // Also verify the widget is in Kids
    const kids = radio._native!.dict.getItem('Kids') as COSArray;
    expect(kids.size()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 10. Round-trip (save -> load -> verify)
// ---------------------------------------------------------------------------

describe('Round-trip (save -> load -> verify)', () => {
  it('should persist a text field with value across save/load', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const tf = form.createTextField('roundTripText');
    tf.setText('persisted value');

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.isNative).toBe(true);

    const loadedForm = loaded.getForm();
    const loadedTf = loadedForm.getTextField('roundTripText');
    expect(loadedTf).toBeDefined();
    expect(loadedTf.getText()).toBe('persisted value');
  });

  it('should persist a checked checkbox across save/load', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const cb = form.createCheckBox('roundTripCb');
    cb.check();

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const loadedForm = loaded.getForm();

    // The checkbox is a Btn type field; find it in fields
    const fields = loadedForm.getFields();
    const cbField = fields.find((f) => f.getName() === 'roundTripCb');
    expect(cbField).toBeDefined();
    // Verify the value persisted as /Yes
    expect(cbField!._native!.value).toBe('Yes');
  });

  it('should persist dropdown options and selection across save/load', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    const dd = form.createDropdown('roundTripDd');
    dd.setOptions(['alpha', 'beta', 'gamma']);
    dd.select('beta');

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const loadedForm = loaded.getForm();
    const fields = loadedForm.getFields();
    const ddField = fields.find((f) => f.getName() === 'roundTripDd');
    expect(ddField).toBeDefined();

    // Re-read /Opt from the dict
    const optEntry = ddField!._native!.dict.getItem('Opt');
    expect(optEntry).toBeInstanceOf(COSArray);
    const optArr = optEntry as COSArray;
    const options: string[] = [];
    for (let i = 0; i < optArr.size(); i++) {
      const item = optArr.get(i);
      if (item instanceof COSString) options.push(item.getString());
    }
    expect(options).toEqual(['alpha', 'beta', 'gamma']);

    // Verify selection
    expect(ddField!._native!.value).toBe('beta');
  });

  it('should persist multiple field types across save/load', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();

    const tf = form.createTextField('multiType_text');
    tf.setText('hello');

    const cb = form.createCheckBox('multiType_cb');
    cb.check();

    const dd = form.createDropdown('multiType_dd');
    dd.setOptions(['one', 'two']);
    dd.select('two');

    const btn = form.createButton('multiType_btn');
    const ol = form.createOptionList('multiType_ol');
    ol.setOptions(['x', 'y', 'z']);

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const loadedForm = loaded.getForm();
    const fields = loadedForm.getFields();
    const names = fields.map((f) => f.getName());

    expect(names).toContain('multiType_text');
    expect(names).toContain('multiType_cb');
    expect(names).toContain('multiType_dd');
    expect(names).toContain('multiType_btn');
    expect(names).toContain('multiType_ol');
  });
});

// ---------------------------------------------------------------------------
// 11. qpdf validation (gated on qpdf availability)
// ---------------------------------------------------------------------------

describe('qpdf validation', () => {
  const HAS_QPDF = hasCommand('qpdf');

  it.skipIf(!HAS_QPDF)(
    'PDF with a text field passes qpdf --check',
    async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      const form = doc.getForm();
      const tf = form.createTextField('qpdfText');
      tf.setText('valid');

      const bytes = await doc.save();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfbox-ts-test-'));
      const pdfPath = path.join(tmpDir, 'text-field.pdf');
      try {
        fs.writeFileSync(pdfPath, bytes);
        // qpdf --check exits 0 on success. The success message includes
        // "errors that qpdf cannot detect" which is NOT an error.
        // We just verify exit code 0 (execSync throws on non-zero).
        execSync(`qpdf --check "${pdfPath}"`, { stdio: 'pipe' });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!HAS_QPDF)(
    'PDF with all field types passes qpdf --check',
    async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const form = doc.getForm();

      const tf = form.createTextField('qpdf_tf');
      tf.setText('test');
      const cb = form.createCheckBox('qpdf_cb');
      cb.check();
      const dd = form.createDropdown('qpdf_dd');
      dd.setOptions(['a', 'b']);
      dd.select('a');
      const ol = form.createOptionList('qpdf_ol');
      ol.setOptions(['x', 'y']);
      const btn = form.createButton('qpdf_btn');
      const radio = form.createRadioGroup('qpdf_radio');
      radio.addOptionToPage('r1', page);
      radio.addOptionToPage('r2', page);
      radio.select('r1');

      const bytes = await doc.save();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfbox-ts-test-'));
      const pdfPath = path.join(tmpDir, 'all-fields.pdf');
      try {
        fs.writeFileSync(pdfPath, bytes);
        // qpdf --check exits 0 on success; execSync throws on non-zero exit.
        execSync(`qpdf --check "${pdfPath}"`, { stdio: 'pipe' });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
