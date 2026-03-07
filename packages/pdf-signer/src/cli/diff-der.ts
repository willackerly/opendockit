#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import forge from 'node-forge';

interface SegmentDiff {
  name: string;
  offsetA: number;
  offsetB: number;
  hexA: string;
  hexB: string;
}

function usage() {
  console.log('Usage: pnpm cms:diff <expected.der> <actual.der>');
}

function bufferFromOid(oid: string): Buffer {
  const der = forge.asn1.oidToDer(oid).getBytes();
  return Buffer.from(der, 'binary');
}

function collectSegments(bytes: Buffer, oid: Buffer, length: number): { offset: number; hex: string } {
  const offset = bytes.indexOf(oid);
  if (offset === -1) {
    return { offset: -1, hex: '' };
  }
  const slice = bytes.slice(offset, offset + length);
  return { offset, hex: slice.toString('hex') };
}

function diffSegments(fileA: string, fileB: string): SegmentDiff[] {
  const bytesA = fs.readFileSync(fileA);
  const bytesB = fs.readFileSync(fileB);
  const targets: Array<{ name: string; oid: string; span: number }> = [
    { name: 'contentType', oid: forge.pki.oids.contentType, span: 48 },
    { name: 'signingTime', oid: forge.pki.oids.signingTime, span: 32 },
    { name: 'cmsAlgorithmProtection', oid: '1.2.840.113549.1.9.52', span: 80 },
    { name: 'messageDigest', oid: forge.pki.oids.messageDigest, span: 80 },
  ];

  const diffs: SegmentDiff[] = [];
  for (const target of targets) {
    const oidBuffer = bufferFromOid(target.oid);
    const segA = collectSegments(bytesA, oidBuffer, target.span);
    const segB = collectSegments(bytesB, oidBuffer, target.span);
    if (segA.offset === -1 || segB.offset === -1 || segA.hex !== segB.hex) {
      diffs.push({
        name: target.name,
        offsetA: segA.offset,
        offsetB: segB.offset,
        hexA: segA.hex,
        hexB: segB.hex,
      });
    }
  }

  return diffs;
}

const [, , fileA, fileB] = process.argv;
if (!fileA || !fileB) {
  usage();
  process.exit(1);
}

const resolvedA = path.resolve(fileA);
const resolvedB = path.resolve(fileB);
const diffs = diffSegments(resolvedA, resolvedB);
if (diffs.length === 0) {
  console.log('No segment differences detected (contentType/signingTime/cmsAlgorithmProtection/messageDigest).');
} else {
  for (const diff of diffs) {
    console.log(`\n[${diff.name}]`);
    console.log(`  expected@${diff.offsetA}: ${diff.hexA || '(missing)'}`);
    console.log(`  actual@${diff.offsetB}:   ${diff.hexB || '(missing)'}`);
  }
  process.exitCode = 1;
}
