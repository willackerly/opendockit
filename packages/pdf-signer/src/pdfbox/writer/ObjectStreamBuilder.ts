import type { COSBase } from '../cos/COSBase';
import { COSObjectKey } from './COSObjectKey';
import { COSWriterObjectStream } from './COSWriterObjectStream';

export interface ObjectStreamPlacement {
  key: COSObjectKey;
  index: number;
}

export interface ObjectStreamFlushResult {
  stream: ReturnType<COSWriterObjectStream['buildStream']>;
  placements: ObjectStreamPlacement[];
}

/**
 * Batches compressible objects into /ObjStm wrappers (no compression yet).
 */
export class ObjectStreamBuilder {
  private readonly pending: Array<{ key: COSObjectKey; object: COSBase }> = [];

  constructor(private readonly maxObjectsPerStream: number = 200) {}

  addObject(key: COSObjectKey | undefined, object: COSBase | undefined | null): void {
    if (!key || !object) {
      return;
    }
    this.pending.push({ key, object });
  }

  isFull(): boolean {
    return this.pending.length >= this.maxObjectsPerStream;
  }

  get size(): number {
    return this.pending.length;
  }

  flush(_parentKey?: COSObjectKey): ObjectStreamFlushResult {
    if (this.pending.length === 0) {
      throw new Error('Cannot flush empty object stream');
    }
    const streamWriter = new COSWriterObjectStream();
    for (const entry of this.pending) {
      streamWriter.prepareObject(entry.key, entry.object);
    }
    const stream = streamWriter.buildStream();
    const placements = this.pending.map((entry, index) => ({ key: entry.key, index }));
    this.pending.length = 0;
    return { stream, placements };
  }
}
