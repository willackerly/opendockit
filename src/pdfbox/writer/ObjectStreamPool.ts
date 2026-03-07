import { COSObjectKey } from './COSObjectKey';
import type { COSBase } from '../cos/COSBase';
import { ObjectStreamBuilder } from './ObjectStreamBuilder';
import type { ObjectStreamFlushResult } from './ObjectStreamBuilder';

const DEFAULT_OBJECTS_PER_STREAM = 200;

export class ObjectStreamPool {
  private readonly builder: ObjectStreamBuilder;

  constructor(private readonly objectsPerStream: number = DEFAULT_OBJECTS_PER_STREAM) {
    this.builder = new ObjectStreamBuilder(objectsPerStream);
  }

  enqueue(objectKey: COSObjectKey | undefined, object: COSBase | undefined | null): void {
    this.builder.addObject(objectKey, object);
  }

  shouldFlush(): boolean {
    return this.builder.size >= this.objectsPerStream;
  }

  flush(parentStreamKey: COSObjectKey): ObjectStreamFlushResult {
    return this.builder.flush(parentStreamKey);
  }

  get size(): number {
    return this.builder.size;
  }
}
