import { COSStream, COSName, COSInteger, COSArray } from '../cos/COSTypes';
import type { TableXRefEntry } from './XRefEntries';
import { XRefEntryType } from './XRefEntries';
import { sortXRefEntries } from './xref-helpers';
import type { TrailerInfo } from '../parser/trailer';
import { buildIncrementalTrailerDictionaryObject } from '../parser/trailer';
import { deflate } from 'pako';

interface XRefStreamOptions {
  trailer: TrailerInfo;
  size: number;
  prev: number;
}

export function buildXRefStream(
  entries: TableXRefEntry[],
  options: XRefStreamOptions
): COSStream {
  const sortedEntries = sortXRefEntries(entries.filter((entry) => entry.inUse));
  const stream = new COSStream();
  stream.setItem(COSName.LENGTH, new COSInteger(0));

  const trailerDict = buildIncrementalTrailerDictionaryObject(options.trailer, {
    size: options.size,
    prev: options.prev,
  });
  trailerDict.removeItem(COSName.SIZE);
  for (const [key, value] of trailerDict.entrySet()) {
    stream.setItem(key, value);
  }

  const indexArray = buildIndexArrayFromEntries(sortedEntries);
  stream.setItem(COSName.TYPE, COSName.XREF);
  stream.setItem(COSName.SIZE, new COSInteger(options.size));
  stream.setItem(COSName.INDEX, indexArray);

  const columnWidths = computeColumnWidths(sortedEntries);
  stream.setItem(new COSName('W'), buildArrayFromNumbers(columnWidths));

  const data = serializeXRefEntries(sortedEntries, columnWidths);
  const compressed = deflate(data);
  stream.setItem(new COSName('Filter'), new COSName('FlateDecode'));
  stream.setItem(COSName.LENGTH, new COSInteger(compressed.length));
  stream.setData(compressed);
  return stream;
}

function buildIndexArrayFromEntries(entries: TableXRefEntry[]): COSArray {
  const numbers = new Set<number>([0]);
  for (const entry of entries) {
    numbers.add(entry.objectNumber);
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const ranges: Array<{ start: number; count: number }> = [];
  let first = sorted[0];
  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (current === first + count) {
      count += 1;
    } else {
      ranges.push({ start: first, count });
      first = current;
      count = 1;
    }
  }
  ranges.push({ start: first, count });
  const array = new COSArray();
  for (const range of ranges) {
    array.add(new COSInteger(range.start));
    array.add(new COSInteger(range.count));
  }
  return array;
}

function buildArrayFromNumbers(values: number[]): COSArray {
  const array = new COSArray();
  for (const value of values) {
    array.add(new COSInteger(value));
  }
  return array;
}

function computeColumnWidths(entries: TableXRefEntry[]): number[] {
  let maxFirst = 0;
  let maxSecond = 0;
  let maxThird = 0;
  const consider = (first: number, second: number, third: number) => {
    maxFirst = Math.max(maxFirst, first);
    maxSecond = Math.max(maxSecond, second);
    maxThird = Math.max(maxThird, third);
  };
  for (const entry of entries) {
    const { first, second, third } = extractColumnValues(entry);
    consider(first, second, third);
  }
  const toWidth = (value: number) => {
    let bytes = 0;
    let remaining = value;
    do {
      bytes += 1;
      remaining >>= 8;
    } while (remaining > 0);
    return Math.max(bytes, 1);
  };
  return [toWidth(maxFirst), toWidth(maxSecond), toWidth(maxThird)];
}

function extractColumnValues(entry: TableXRefEntry): {
  first: number;
  second: number;
  third: number;
} {
  switch (entry.type) {
    case XRefEntryType.FREE:
      return { first: 0, second: entry.nextFreeObject ?? 0, third: entry.generation };
    case XRefEntryType.OBJECT_STREAM:
      return {
        first: 2,
        second: entry.objectStreamParent ?? 0,
        third: entry.objectStreamIndex ?? 0,
      };
    case XRefEntryType.NORMAL:
    default:
      return { first: 1, second: entry.byteOffset, third: entry.generation };
  }
}

function serializeXRefEntries(entries: TableXRefEntry[], widths: number[]): Uint8Array {
  const rowLength = widths[0] + widths[1] + widths[2];
  const buffer = new Uint8Array((entries.length + 1) * rowLength);
  let offset = 0;
  offset = writeEntry(buffer, offset, widths, 0, 0, 65535);
  for (const entry of entries) {
    const { first, second, third } = extractColumnValues(entry);
    offset = writeEntry(buffer, offset, widths, first, second, third);
  }
  return buffer;
}

function writeEntry(
  buffer: Uint8Array,
  offset: number,
  widths: number[],
  first: number,
  second: number,
  third: number
): number {
  offset = writeNumber(buffer, offset, widths[0], first);
  offset = writeNumber(buffer, offset, widths[1], second);
  offset = writeNumber(buffer, offset, widths[2], third);
  return offset;
}

function writeNumber(buffer: Uint8Array, offset: number, width: number, value: number): number {
  let remaining = value;
  for (let i = width - 1; i >= 0; i--) {
    buffer[offset + i] = remaining & 0xff;
    remaining >>= 8;
  }
  return offset + width;
}
