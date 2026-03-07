import { COSStream, COSName, COSInteger } from '../cos/COSTypes';
import type { COSBase } from '../cos/COSBase';
import { COSObjectKey } from './COSObjectKey';
import { COSStandardOutputStream } from './COSStandardOutputStream';
import { COSWriter } from './COSWriter';
import pako from 'pako';

/**
 * Minimal replica of PDFBox's COSWriterObjectStream: batches small objects into
 * a single /ObjStm body while tracking the per-object offsets.
 */
export class COSWriterObjectStream {
  private readonly encoder = new TextEncoder();
  private readonly preparedKeys: COSObjectKey[] = [];
  private readonly preparedObjects: COSBase[] = [];

  prepareObject(key: COSObjectKey | undefined, object: COSBase | undefined | null): void {
    if (!key || !object) {
      return;
    }
    this.preparedKeys.push(key);
    this.preparedObjects.push(object);
  }

  getPreparedKeys(): readonly COSObjectKey[] {
    return this.preparedKeys;
  }

  /**
   * Builds a COSStream containing all prepared objects using the PDF object-stream layout:
   * [ objectNumber offset ... ]<space><object bodies...>
   */
  buildStream(): COSStream {
    const stream = new COSStream();
    stream.setItem(COSName.TYPE, new COSName('ObjStm'));

    const { headerLength, bytes } = this.serialize();
    stream.setItem(new COSName('N'), new COSInteger(this.preparedKeys.length));
    stream.setItem(new COSName('First'), new COSInteger(headerLength));
    const compressed = pako.deflate(bytes);
    stream.setItem(new COSName('Filter'), new COSName('FlateDecode'));
    stream.setItem(COSName.LENGTH, new COSInteger(compressed.length));
    stream.setData(compressed);
    return stream;
  }

  private serialize(): { headerLength: number; bytes: Uint8Array } {
    const objectBuffers: Uint8Array[] = [];
    const offsets: number[] = [];
    let cursor = 0;
    for (const object of this.preparedObjects) {
      const bytes = this.serializeObject(object);
      objectBuffers.push(bytes);
      offsets.push(cursor);
      cursor += bytes.length;
    }

    const headerParts: string[] = [];
    for (let i = 0; i < this.preparedKeys.length; i++) {
      headerParts.push(`${this.preparedKeys[i].objectNumber} ${offsets[i]}`);
    }
    const headerBytes = this.encoder.encode(headerParts.join(' ') + '\n');
    const totalLength = headerBytes.length + cursor;
    const result = new Uint8Array(totalLength);
    result.set(headerBytes, 0);

    let bodyOffset = headerBytes.length;
    for (const buffer of objectBuffers) {
      result.set(buffer, bodyOffset);
      bodyOffset += buffer.length;
    }
    return { headerLength: headerBytes.length, bytes: result };
  }

  private serializeObject(object: COSBase): Uint8Array {
    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);
    object.accept(writer);
    return output.toUint8Array();
  }
}
