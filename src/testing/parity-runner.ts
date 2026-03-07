import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import forge from 'node-forge';

import {
  preparePdfWithAppearance,
  signPreparedPdfWithPDFBox,
} from '../signer/pdfbox-signer.js';
import { getFixtureSigner } from './fixture-signer.js';
import type { SignatureObjectNumbers } from '../types/index.js';
import { parsePdfTrailer } from '../pdfbox/index.js';
import { parseXrefEntries } from '../pdfbox/parser/xref.js';
import { XRefEntryType } from '../pdfbox/writer/XRefEntries.js';

export interface TestCase {
  id: string;
  file: string;
  expectedOutcome: string;
  notes?: string;
}

export interface FixtureMetadata {
  sha256: string;
  size: number;
  byteRange?: [number, number, number, number];
  signatureLength?: number;
  xrefStart?: number;
  objects?: SignatureObjectNumbers;
  signedAt?: string;
  mode?: 'incremental' | 'full-save';
}

export interface ComparisonResult {
  testCase: TestCase;
  ts: FixtureMetadata;
  java?: FixtureMetadata;
  mismatches: string[];
  javaRan: boolean;
}

export interface CompareOptions {
  fixtureId?: string;
  fixtures?: TestCase[];
  manifestPath?: string;
  skipJava?: boolean;
  javaBinary?: string;
  tempDir?: string;
  log?: (line: string) => void;
  includeAllOutcomes?: boolean;
  failOnMismatch?: boolean;
}

const defaultLog = (line: string) => console.log(line);

function defaultManifestPath() {
  return path.resolve(process.cwd(), 'test-pdfs', 'manifest.json');
}

function loadManifest(manifestPath = defaultManifestPath()): TestCase[] {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.testCases as TestCase[];
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function findLastMatch(source: string, pattern: RegExp): RegExpMatchArray | null {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const matches = [...source.matchAll(regex)];
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

function extractMetadata(bytes: Uint8Array): FixtureMetadata {
  const buffer = Buffer.from(bytes);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const ascii = buffer.toString('latin1');

  const byteRangeMatch = findLastMatch(
    ascii,
    /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/
  );
  const contentsMatch = findLastMatch(ascii, /\/Contents\s*<([\s\S]*?)>/);
  const xrefMatch = ascii.match(/startxref\s+(\d+)/);
  const modDateMatch = findLastMatch(ascii, /\/M\s*\((D:[^)]+)\)/);

  const objects = scanObjects(ascii);
  const signatureObj = findObject(objects, (body) => /\/Type\s*\/Sig\b/.test(body));
  const widgetObj = findObject(
    objects,
    (body) => /\/Subtype\s*\/Widget\b/.test(body) && /\/FT\s*\/Sig\b/.test(body)
  );
  const acroFormObj = findObject(objects, (body) => /\/Fields\s+\[/.test(body) && /\/SigFlags/.test(body));

  let pageObjectNumber: number | undefined;
  if (widgetObj) {
    const pageMatch = widgetObj.body.match(/\/P\s+(\d+)\s+(\d+)\s+R/);
    if (pageMatch) {
      pageObjectNumber = Number(pageMatch[1]);
    }
  }

  let catalogObjectNumber: number | undefined;
  try {
    const trailer = parsePdfTrailer(bytes);
    catalogObjectNumber = trailer.rootRef.objectNumber;
  } catch {
    // ignore trailer parse errors for metadata extraction
  }

  return {
    sha256,
    size: buffer.length,
    byteRange: byteRangeMatch
      ? [
          Number(byteRangeMatch[1]),
          Number(byteRangeMatch[2]),
          Number(byteRangeMatch[3]),
          Number(byteRangeMatch[4]),
        ]
      : undefined,
    signatureLength: contentsMatch ? contentsMatch[1].replace(/\s+/g, '').length / 2 : undefined,
    xrefStart: xrefMatch ? Number(xrefMatch[1]) : undefined,
    signedAt: modDateMatch ? pdfDateToISO(modDateMatch[1]) : undefined,
    objects:
      signatureObj || widgetObj || acroFormObj || catalogObjectNumber
        ? {
            signature: signatureObj?.objectNumber,
            widget: widgetObj?.objectNumber,
            acroForm: acroFormObj?.objectNumber,
            catalog: catalogObjectNumber,
            page: pageObjectNumber,
          }
        : undefined,
  };
}

function writeStructureSummary(bytes: Uint8Array, outputPath: string): void {
  const shouldWrite =
    typeof process !== 'undefined' &&
    !!(process as any)?.env?.PDFBOX_TS_WRITE_STRUCTURE &&
    (process as any).env.PDFBOX_TS_WRITE_STRUCTURE !== '0';
  if (!shouldWrite) {
    return;
  }
  const trailer = parsePdfTrailer(bytes);
  const { entries } = parseXrefEntries(bytes, trailer);
  const lines = entries
    .filter((entry) => entry.inUse)
    .sort((a, b) => {
      if (a.objectNumber === b.objectNumber) {
        return a.generation - b.generation;
      }
      return a.objectNumber - b.objectNumber;
    })
    .map((entry) => {
      const type =
        entry.type === XRefEntryType.OBJECT_STREAM
          ? 'OBJSTM'
          : entry.type === XRefEntryType.NORMAL
          ? 'NORMAL'
          : 'FREE';
      const parent =
        entry.objectStreamParent !== undefined ? `${entry.objectStreamParent}` : '';
      const index =
        entry.objectStreamIndex !== undefined ? `${entry.objectStreamIndex}` : '';
      const offset =
        entry.byteOffset !== undefined && Number.isFinite(entry.byteOffset)
          ? `${entry.byteOffset}`
          : '';
      return `${entry.objectNumber} ${entry.generation} ${type} offset=${offset} parent=${parent} index=${index}`;
    });
  fs.writeFileSync(outputPath, lines.join('\n'));
}

interface ParsedObjectRecord {
  objectNumber: number;
  generationNumber: number;
  body: string;
}

function scanObjects(pdfText: string): ParsedObjectRecord[] {
  const regex = /(\d+)\s+(\d+)\s+obj([\s\S]*?)(?:endobj|$)/g;
  const results: ParsedObjectRecord[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(pdfText)) !== null) {
    results.push({
      objectNumber: Number(match[1]),
      generationNumber: Number(match[2]),
      body: match[3],
    });
  }
  return results;
}

function findObject(
  objects: ParsedObjectRecord[],
  predicate: (body: string) => boolean
): ParsedObjectRecord | undefined {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (predicate(objects[i].body)) {
      return objects[i];
    }
  }
  return undefined;
}

function pdfDateToISO(pdfDate: string): string | undefined {
  const raw = pdfDate.startsWith('D:') ? pdfDate.slice(2) : pdfDate;
  const match = raw.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|z|[+\-])?(?:(\d{2})'?(\d{2})'?)?/
  );
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second, tzSign, tzHour, tzMinute] = match;
  let tz = 'Z';
  if (tzSign && tzSign.toUpperCase() !== 'Z') {
    const h = tzHour ?? '00';
    const m = tzMinute ?? '00';
    tz = `${tzSign}${h}:${m}`;
  }
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${tz}`;
}

function extractSignatureDer(bytes: Uint8Array): Buffer | undefined {
  const ascii = Buffer.from(bytes).toString('latin1');
  const matches = [...ascii.matchAll(/\/Contents\s*<([\s\S]*?)>/g)];
  if (matches.length === 0) {
    return undefined;
  }
  const hex = matches[matches.length - 1][1].replace(/\s+/g, '');
  return Buffer.from(hex, 'hex');
}

function extractSigningTimeFromDer(der: Uint8Array): string | undefined {
  const buffer = Buffer.from(der);
  const oid = bufferFromOid(forge.pki.oids.signingTime);
  const oidIndex = buffer.indexOf(oid);
  if (oidIndex === -1) {
    return undefined;
  }
  const tagIndex = buffer.indexOf(0x17, oidIndex + oid.length);
  if (tagIndex === -1) {
    return undefined;
  }
  const length = buffer[tagIndex + 1];
  const timeBytes = buffer.slice(tagIndex + 2, tagIndex + 2 + length);
  return utcTimeToISO(timeBytes.toString('ascii'));
}

function utcTimeToISO(value: string): string | undefined {
  // Value format YYMMDDhhmmssZ or with +/-hhmm
  const match = value.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+\-]\d{4})?$/);
  if (!match) {
    return undefined;
  }
  const [, yy, mm, dd, hh, mi, ss, zone] = match;
  const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  let tz = 'Z';
  if (zone && zone !== 'Z') {
    tz = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  }
  return `${year}-${mm}-${dd}T${hh}:${mi}:${ss}${tz}`;
}

function bufferFromOid(oid: string): Buffer {
  const der = forge.asn1.oidToDer(oid).getBytes();
  return Buffer.from(der, 'binary');
}

function applySigningTimeOverrides(pdfTime?: string, cmsTime?: string) {
  if (pdfTime) {
    process.env.PDFBOX_TS_SIGN_TIME = pdfTime;
  } else {
    delete process.env.PDFBOX_TS_SIGN_TIME;
  }

  if (cmsTime) {
    process.env.PDFBOX_TS_CMS_SIGN_TIME = cmsTime;
  } else {
    delete process.env.PDFBOX_TS_CMS_SIGN_TIME;
  }
}

function runJavaSigner(
  inputPath: string,
  outputPath: string,
  javaBinary?: string,
  log: (line: string) => void = defaultLog
): boolean {
  const scriptPath = path.resolve('scripts', 'run-java-signer.sh');
  const env = { ...process.env };
  if (javaBinary) {
    env.JAVA = javaBinary;
  }
  const result = spawnSync(scriptPath, [inputPath, outputPath], {
    stdio: 'inherit',
    env,
  });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    log('   ⚠️  Java runtime not found; skipping Java signer comparison.');
    return false;
  }
  if (result.status !== 0) {
    log('   ⚠️  Java signer exited with non-zero status; comparison skipped.');
    return false;
  }
  return true;
}

export async function compareFixtures(options: CompareOptions = {}): Promise<ComparisonResult[]> {
  const {
    fixtureId,
    fixtures = loadManifest(options.manifestPath),
    skipJava = false,
    javaBinary,
    tempDir = path.resolve('tmp'),
    log = defaultLog,
    includeAllOutcomes = false,
    failOnMismatch = false,
  } = options;

  const availableFixtures = includeAllOutcomes
    ? fixtures
    : fixtures.filter((test) => test.expectedOutcome === 'success');

  const fixtureList = fixtureId
    ? availableFixtures.filter((test) => test.id === fixtureId)
    : availableFixtures;

  if (fixtureId && fixtureList.length === 0) {
    throw new Error(`Fixture "${fixtureId}" not found in manifest`);
  }

  const results: ComparisonResult[] = [];

  for (const testCase of fixtureList) {
    log(`\n=== Fixture: ${testCase.id} (${testCase.file}) ===`);
    const inputPath = path.resolve('test-pdfs', testCase.file);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Fixture file not found: ${inputPath}`);
    }

    const fixtureTempDir = path.join(tempDir, testCase.id);
    ensureDir(fixtureTempDir);
    const tsPdf = path.join(fixtureTempDir, 'ts.pdf');
    const javaPdf = path.join(fixtureTempDir, 'java.pdf');
    const modePath = path.join(fixtureTempDir, 'java-mode.txt');
    if (fs.existsSync(modePath)) {
      fs.unlinkSync(modePath);
    }

    const preparedPath = path.join(fixtureTempDir, 'prepared.pdf');

    const pdfBytes = new Uint8Array(fs.readFileSync(inputPath));
    const signer = getFixtureSigner();
    const prepared = await preparePdfWithAppearance(pdfBytes, signer);
    fs.writeFileSync(preparedPath, Buffer.from(prepared.pdfBytes));

    let javaMeta: FixtureMetadata | undefined;
    let javaRan = false;

    let signingTimeOverride: string | undefined;
    let cmsSigningTimeOverride: string | undefined;

    const capturePath = path.join(fixtureTempDir, 'java-data.bin');
    let javaMode: 'incremental' | 'full-save' | undefined;
    if (!skipJava) {
      process.env.PDFBOX_TS_CAPTURE_DATA = capturePath;
      process.env.PDFBOX_TS_MODE_PATH = modePath;
      javaRan = runJavaSigner(preparedPath, javaPdf, javaBinary, log);
      delete process.env.PDFBOX_TS_CAPTURE_DATA;
      delete process.env.PDFBOX_TS_MODE_PATH;
      if (fs.existsSync(modePath)) {
        const rawMode = fs.readFileSync(modePath, 'utf8').trim();
        if (rawMode === 'incremental' || rawMode === 'full-save') {
          javaMode = rawMode;
        }
      }
      if (javaRan && fs.existsSync(javaPdf) && fs.statSync(javaPdf).size > 0) {
        const javaBytes = new Uint8Array(fs.readFileSync(javaPdf));
        javaMeta = extractMetadata(javaBytes);
        if (javaMode) {
          javaMeta.mode = javaMode;
        }
        const javaDer = extractSignatureDer(javaBytes);
        if (javaDer) {
          fs.writeFileSync(path.join(fixtureTempDir, 'java.der'), javaDer);
        }
        if (fs.existsSync(capturePath)) {
          const captured = new Uint8Array(fs.readFileSync(capturePath));
          fs.writeFileSync(path.join(fixtureTempDir, 'java-data.bin'), captured);
        }
        const signingTimeFromDer = javaDer ? extractSigningTimeFromDer(javaDer) : undefined;
        signingTimeOverride = javaMeta?.signedAt ?? signingTimeFromDer;
        cmsSigningTimeOverride = signingTimeFromDer ?? signingTimeOverride;
        fs.writeFileSync(path.join(fixtureTempDir, 'java.json'), JSON.stringify(javaMeta, null, 2));
        writeStructureSummary(javaBytes, path.join(fixtureTempDir, 'structure-java.txt'));
        log('   ✅ Java signer complete');
      } else {
        log('   ⏭️  Java output missing; comparison skipped.');
      }
    } else {
      log('   ⏭️  Skipping Java signer (per flag)');
    }

    applySigningTimeOverrides(signingTimeOverride, cmsSigningTimeOverride);
    const forceFullSave = javaMode === 'full-save';

    const signed = await signPreparedPdfWithPDFBox(prepared, signer, {
      signatureAppearance: {
        text: 'pdfbox-ts fixture signature',
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
      reason: 'pdfbox-ts parity test',
      location: 'Automation Harness',
      forceFullSave,
    });

    fs.writeFileSync(tsPdf, Buffer.from(signed.signedData));
    const tsDer = extractSignatureDer(signed.signedData);
    if (tsDer) {
      fs.writeFileSync(path.join(fixtureTempDir, 'ts.der'), tsDer);
    }
    const tsMeta = extractMetadata(signed.signedData);
    tsMeta.mode = forceFullSave ? 'full-save' : 'incremental';
    fs.writeFileSync(path.join(fixtureTempDir, 'ts.json'), JSON.stringify(tsMeta, null, 2));
    writeStructureSummary(signed.signedData, path.join(fixtureTempDir, 'structure-ts.txt'));
    log('   ✅ TypeScript signer complete');

    const mismatches: string[] = [];
    if (javaMeta) {
      if (tsMeta.sha256 !== javaMeta.sha256) mismatches.push('sha256');
      if (tsMeta.size !== javaMeta.size) mismatches.push('size');
      if (
        tsMeta.byteRange &&
        javaMeta.byteRange &&
        JSON.stringify(tsMeta.byteRange) !== JSON.stringify(javaMeta.byteRange)
      ) {
        mismatches.push('byteRange');
      }
      if (
        tsMeta.signatureLength &&
        javaMeta.signatureLength &&
        tsMeta.signatureLength !== javaMeta.signatureLength
      ) {
        mismatches.push('signatureLength');
      }
      if (
        tsMeta.xrefStart !== undefined &&
        javaMeta.xrefStart !== undefined &&
        tsMeta.xrefStart !== javaMeta.xrefStart
      ) {
        mismatches.push('xrefStart');
      }
      if (tsMeta.objects && javaMeta.objects) {
        (['signature', 'widget', 'acroForm', 'catalog', 'page'] as const).forEach((key) => {
          if (
            tsMeta.objects?.[key] !== undefined &&
            javaMeta.objects?.[key] !== undefined &&
            tsMeta.objects[key] !== javaMeta.objects[key]
          ) {
            mismatches.push(`object:${key}`);
          }
        });
      }

      if (mismatches.length === 0) {
        log('   🎯 Metadata matches between Java and TypeScript outputs');
      } else {
        log(`   ⚠️ Differences detected: ${mismatches.join(', ')}`);
      }
    }

    results.push({
      testCase,
      ts: tsMeta,
      java: javaMeta,
      mismatches,
      javaRan: !!javaMeta && javaRan,
    });
  }

  if (failOnMismatch) {
    const failing = results.filter(
      (result) => result.javaRan && result.mismatches.length > 0
    );
    if (failing.length > 0) {
      const summary = failing
        .map((result) => `${result.testCase.id} [${result.mismatches.join(', ')}]`)
        .join(', ');
      throw new Error(`Parity mismatches detected: ${summary}`);
    }
  }

  return results;
}

export { loadManifest, extractMetadata };
