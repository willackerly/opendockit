import { COSObjectKey } from './COSObjectKey';

export enum XRefEntryType {
  FREE = 0,
  NORMAL = 1,
  OBJECT_STREAM = 2,
}

export interface TableXRefEntry {
  objectNumber: number;
  byteOffset: number;
  generation: number;
  inUse: boolean;
  type: XRefEntryType;
  nextFreeObject?: number;
  objectStreamParent?: number;
  objectStreamIndex?: number;
}

export abstract class BaseXRefEntry {
  constructor(public readonly key: COSObjectKey, public readonly type: XRefEntryType) {}

  abstract toTableEntry(): TableXRefEntry;
}

export class NormalXRefEntry extends BaseXRefEntry {
  constructor(
    key: COSObjectKey,
    private readonly byteOffset: number,
    private readonly objectStreamParent?: COSObjectKey,
    private readonly objectStreamIndex?: number
  ) {
    super(
      key,
      objectStreamParent !== undefined
        ? XRefEntryType.OBJECT_STREAM
        : XRefEntryType.NORMAL
    );
  }

  get objectNumber(): number {
    return this.key.objectNumber;
  }

  toTableEntry(): TableXRefEntry {
    return {
      objectNumber: this.key.objectNumber,
      byteOffset: this.byteOffset,
      generation: this.key.generationNumber,
      inUse: true,
      type: this.type,
      objectStreamParent: this.objectStreamParent?.objectNumber,
      objectStreamIndex: this.objectStreamIndex,
    };
  }
}

export class FreeXRefEntry extends BaseXRefEntry {
  static readonly NULL_ENTRY = new FreeXRefEntry(new COSObjectKey(0, 65535), 0);

  constructor(key: COSObjectKey, private readonly nextFreeObject: number) {
    super(key, XRefEntryType.FREE);
  }

  toTableEntry(): TableXRefEntry {
    return {
      objectNumber: this.key.objectNumber,
      generation: this.key.generationNumber,
      byteOffset: this.nextFreeObject,
      inUse: false,
      type: XRefEntryType.FREE,
      nextFreeObject: this.nextFreeObject,
    };
  }
}

export class ObjectStreamXRefEntry extends BaseXRefEntry {
  constructor(
    key: COSObjectKey,
    private readonly parent: COSObjectKey,
    private readonly index: number
  ) {
    super(key, XRefEntryType.OBJECT_STREAM);
  }

  toTableEntry(): TableXRefEntry {
    return {
      objectNumber: this.key.objectNumber,
      generation: this.key.generationNumber,
      byteOffset: 0,
      inUse: true,
      type: XRefEntryType.OBJECT_STREAM,
      objectStreamParent: this.parent.objectNumber,
      objectStreamIndex: this.index,
    };
  }
}
