import {
  COSDictionary,
  COSName,
  COSArray,
  COSInteger,
  COSString,
  COSFloat,
  COSObjectReference,
} from '../cos/COSTypes';

function buildRectArray(rect: [number, number, number, number]): COSArray {
  const array = new COSArray();
  for (const value of rect) {
    const literal = Number.isInteger(value) ? `${value.toFixed(1)}` : `${value}`;
    array.add(new COSFloat(value, literal));
  }
  return array;
}

/**
 * Minimal PDSignatureField facsimile used to construct widget dictionaries in a
 * deterministic order (matching PDFBox output).
 */
export class PDSignatureField {
  private readonly fieldName: string;
  private rect: [number, number, number, number] = [0, 0, 0, 0];
  private appearanceRef?: COSObjectReference;
  private valueRef?: COSObjectReference;
  private pageRef?: COSObjectReference;

  constructor(fieldName: string) {
    this.fieldName = fieldName;
  }

  setRectangle(rect: [number, number, number, number]): void {
    this.rect = rect;
  }

  setAppearance(appearanceRef: COSObjectReference): void {
    this.appearanceRef = appearanceRef;
  }

  setValue(signatureRef: COSObjectReference): void {
    this.valueRef = signatureRef;
  }

  setPage(pageRef: COSObjectReference): void {
    this.pageRef = pageRef;
  }

  getCOSObject(): COSDictionary {
    const dict = new COSDictionary();
    dict.setItem(COSName.FT, COSName.SIG);
    dict.setItem(COSName.TYPE, new COSName('Annot'));
    dict.setItem(COSName.SUBTYPE, new COSName('Widget'));
    dict.setItem(COSName.F, new COSInteger(132));
    dict.setItem(COSName.T, new COSString(this.fieldName));

    if (this.valueRef) {
      dict.setItem(COSName.V, this.valueRef);
    }
    if (this.pageRef) {
      dict.setItem(COSName.P, this.pageRef);
    }

    const rectArray = buildRectArray(this.rect);
    dict.setItem(COSName.RECT, rectArray);

    if (this.appearanceRef) {
      dict.setItem(new COSName('AP'), this.appearanceRef);
    }

    return dict;
  }
}
