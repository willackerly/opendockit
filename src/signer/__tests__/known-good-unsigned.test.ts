import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signPDFWithPDFBox } from '../pdfbox-signer';
import { getFixtureSigner } from '../../testing/fixture-signer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWN_GOOD_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'known-good-unsigned');
const folderExists = fs.existsSync(KNOWN_GOOD_DIR);
const envEnabled = !!process.env.PDFBOX_TS_CORPUS;

/**
 * Robustness tests against 1000+ real-world and synthetic unsigned PDFs.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  GATED: requires PDFBOX_TS_CORPUS=1 AND the corpus folder.    │
 * │                                                                │
 * │  This is NOT part of the default `pnpm test` run.             │
 * │  It takes ~10 minutes and tests 1000+ real-world PDFs.        │
 * │                                                                │
 * │  Run it:                                                       │
 * │    pnpm test:corpus        (recommended)                       │
 * │    pnpm test:all           (runs everything)                   │
 * │                                                                │
 * │  IMPORTANT: Run before every release / beta bump.              │
 * │  See CLAUDE.md "Testing Tiers" for the full checklist.         │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Skipped when:
 *   1. PDFBOX_TS_CORPUS=1 is not set (env gate), OR
 *   2. The peer folder ../known-good-unsigned/ doesn't exist
 *
 * The folder contains PII and third-party test files — NOT in the repo.
 *
 * Sources:
 *   - Apache PDFBox test suite (AcroForms, encryption, annotations, merges)
 *   - Mozilla PDF.js test suite (768 edge-case rendering/parsing PDFs)
 *   - qpdf test suite (xref, linearization, object streams, hybrid xref)
 *   - SafeDocs (DARPA) targeted edge cases
 *   - pyHanko signing-focused tests
 *   - OpenPreserve Cabinet of Horrors
 *   - PDF 2.0 spec examples
 *   - IRS government forms (AcroForm, linearized)
 *   - GovDocs1 error PDFs (real-world failures)
 *
 * Run:
 *   pnpm test:corpus
 */

const SKIP = !envEnabled || !folderExists;
if (!envEnabled && folderExists) {
  console.log(
    '\n' +
    '╔══════════════════════════════════════════════════════════════════╗\n' +
    '║  CORPUS TESTS SKIPPED — set PDFBOX_TS_CORPUS=1 to enable      ║\n' +
    '║  Run: pnpm test:corpus     (~10 min, 1000+ PDFs)              ║\n' +
    '║  Run: pnpm test:all        (all tiers including corpus)        ║\n' +
    '╚══════════════════════════════════════════════════════════════════╝\n'
  );
}

// ─── Classification ─────────────────────────────────────────────

/** Detect if a PDF is encrypted by scanning for /Encrypt */
function isEncrypted(bytes: Uint8Array): boolean {
  const text = new TextDecoder('latin1').decode(bytes);
  return text.includes('/Encrypt');
}

/** Collect all PDFs recursively from a directory */
function collectPdfs(dir: string): { relativePath: string; fullPath: string }[] {
  if (!fs.existsSync(dir)) return [];
  const results: { relativePath: string; fullPath: string }[] = [];
  function walk(currentDir: string, prefix: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (entry.name.toLowerCase().endsWith('.pdf')) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        results.push({ relativePath: rel, fullPath: path.join(currentDir, entry.name) });
      }
    }
  }
  walk(dir, '');
  return results;
}

function basename(relativePath: string): string {
  return path.basename(relativePath);
}

/**
 * Known-encrypted files — should throw, not crash.
 */
const ENCRYPTED_PATTERNS = [
  'encrypted-',
  'minimal-aes256',
  'minimal-rc4',
  'minimal-pubkey',
  'pubkey-',
  'encryption_',
  'unicode-corrigendum',  // SafeDocs encrypted password tests
  'AES128',               // PDFBox AES encryption tests
  'AES256',
  'AESkeylength',
  'PasswordSample',       // PDFBox password-protected tests
  'empty_protected',      // PDF.js protected test
];

/**
 * Known-malformed files — any error is acceptable (just don't hang).
 */
const MALFORMED_PATTERNS = [
  'bad-xref',
  'bad-token-startxref',
  'append-xref-loop',
  'dangling-bad-xref',
  'damaged-stream',
  'broken-objstream',
  'minimal-badxref',
  'minimal-broken-xref-size',
  'minimal-startxref-hopeless',
  'corruptionOneByteMissing',
  'circular-page-tree',
  'form-tree-circular-ref',
  'minimal-with-nonexistent-refs',
  'minimal-startxref-obo',
  'content-stream-errors',
  'tail-uncovered',
  'weird-byterange',
  'one-byterange',
  'signature-gap-too-big',
  'Dual-startxref',
  'minimal-illegal-header',
  'struct-tree-circular',
  'malformed-encrypt',
  // pdf-lib incompatibilities (edge case page structures)
  'page-tree-direct-kid',
  'Dialect-DictIsStream',
  'Dialect-StreamIsDict',
  // PDFBox malformed/fuzz tests
  'MissingCatalog',           // no /Root catalog object
  'PDFBOX-6040-nodeloop',     // page tree loop
  'PDFBOX-6041-example',      // malformed page tree
  // PDF.js fuzz artifacts and malformed edge cases
  '-fuzzed',                  // fuzzer-generated corrupt PDFs
  'poppler-85140-0',          // poppler regression — malformed xref
  'Pages-tree-refs',          // circular page tree references
  'REDHAT-1531897-0',         // Red Hat fuzz artifact
];

/**
 * Known limitations — files that fail due to documented bugs.
 * Each entry maps a basename pattern to the bug category.
 *
 * All previously known limitations (acroform-in-objstm, missing-root-trailer,
 * unterminated-trailer-dict) have been resolved:
 * - acroform-in-objstm: Fixed by xref-aware ObjectResolver that resolves
 *   type-2 entries from Object Streams.
 * - missing-root-trailer: Fixed by /Prev chain walking in trailer parser.
 * - unterminated-trailer-dict: Fixed by handling concatenated "obj<<" tokens
 *   and adding string/comment awareness to findDictionaryEndBytes.
 */
const KNOWN_LIMITATIONS: Record<string, string> = {
  // PDF.js regression PDFs that trigger parsing failures in exotic structures.
  // These are valid PDFs with unusual structures that can't be loaded.
  'bug1020226.pdf': 'pdf-lib-parse-failure',
  'bug1250079.pdf': 'pdf-lib-parse-failure',
  'bug1980958.pdf': 'pdf-lib-parse-failure',
  'issue15590.pdf': 'pdf-lib-parse-failure',
  'issue19800.pdf': 'pdf-lib-parse-failure',
  'issue6069.pdf': 'pdf-lib-parse-failure',
  'issue9105_other.pdf': 'pdf-lib-parse-failure',
  // Previously known limitations (now resolved):
  // - broken-xref (5 files): Fixed by brute-force xref scanner fallback
  // - malformed-catalog (5 files): Fixed by scanning recovery + comment CR handling
  // - page-tree-issue (2 files): Fixed by supplementary object recovery + offset validation
  // - filled-background.pdf: Inadvertently fixed by brute-force scanner + recovery improvements
};

function matchesPattern(relativePath: string, patterns: string[]): boolean {
  const name = basename(relativePath);
  return patterns.some((p) => name.includes(p));
}

// ─── Test Suite ─────────────────────────────────────────────

describe.skipIf(SKIP)('known-good-unsigned PDFs', () => {
  const allPdfs = !SKIP ? collectPdfs(KNOWN_GOOD_DIR) : [];
  const signer = folderExists ? getFixtureSigner() : (null as any);

  // Classify each PDF
  const signable: typeof allPdfs = [];
  const encrypted: typeof allPdfs = [];
  const malformed: typeof allPdfs = [];
  const knownLimitations: (typeof allPdfs[0] & { bug: string })[] = [];

  for (const pdf of allPdfs) {
    const name = basename(pdf.relativePath);

    if (KNOWN_LIMITATIONS[name]) {
      knownLimitations.push({ ...pdf, bug: KNOWN_LIMITATIONS[name] });
    } else if (matchesPattern(pdf.relativePath, ENCRYPTED_PATTERNS)) {
      encrypted.push(pdf);
    } else if (matchesPattern(pdf.relativePath, MALFORMED_PATTERNS) || pdf.relativePath.startsWith('tier3-govdocs-errors/')) {
      malformed.push(pdf);
    } else {
      try {
        const bytes = fs.readFileSync(pdf.fullPath);
        if (isEncrypted(new Uint8Array(bytes))) {
          encrypted.push(pdf);
        } else {
          signable.push(pdf);
        }
      } catch {
        malformed.push(pdf);
      }
    }
  }

  // Log classification summary
  it('classification summary', () => {
    console.log(`\n📊 Robustness corpus: ${allPdfs.length} PDFs`);
    console.log(`   ✅ Should sign:        ${signable.length}`);
    console.log(`   🔒 Encrypted:          ${encrypted.length}`);
    console.log(`   💥 Malformed:           ${malformed.length}`);
    console.log(`   ⚠️  Known limitations:  ${knownLimitations.length}`);

    // Bug breakdown
    const bugs: Record<string, number> = {};
    for (const { bug } of knownLimitations) {
      bugs[bug] = (bugs[bug] || 0) + 1;
    }
    for (const [bug, count] of Object.entries(bugs).sort((a, b) => b[1] - a[1])) {
      console.log(`      • ${bug}: ${count}`);
    }
    expect(allPdfs.length).toBeGreaterThan(0);
  });

  // ─── Should sign successfully ───
  describe('should sign successfully', () => {
    for (const { relativePath, fullPath } of signable) {
      it(relativePath, async () => {
        const pdfBytes = new Uint8Array(fs.readFileSync(fullPath));

        const result = await signPDFWithPDFBox(pdfBytes, signer, {
          signatureAppearance: {
            text: 'Robustness test',
            position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
          },
          reason: 'robustness test',
        });

        expect(result.signedData).toBeInstanceOf(Uint8Array);
        expect(result.signedData.length).toBeGreaterThan(0);
        expect(result.signatureInfo.byteRange).toHaveLength(4);
        expect(result.signatureInfo.signatureSize).toBeGreaterThan(0);

        // Verify ByteRange covers the full document
        const [, , b, c] = result.signatureInfo.byteRange;
        expect(b + c).toBe(result.signedData.length);
      });
    }
  });

  // ─── Encrypted — should reject gracefully ───
  describe('encrypted — should reject gracefully', () => {
    for (const { relativePath, fullPath } of encrypted) {
      it(relativePath, async () => {
        const pdfBytes = new Uint8Array(fs.readFileSync(fullPath));
        await expect(
          signPDFWithPDFBox(pdfBytes, signer, {
            signatureAppearance: {
              text: 'Robustness test',
              position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
            },
          })
        ).rejects.toThrow();
      });
    }
  });

  // ─── Known limitations — should throw (not hang) ───
  describe.skipIf(knownLimitations.length === 0)('known limitations — should throw', () => {
    for (const { relativePath, fullPath, bug } of knownLimitations) {
      it(`[${bug}] ${relativePath}`, async () => {
        const pdfBytes = new Uint8Array(fs.readFileSync(fullPath));
        await expect(
          signPDFWithPDFBox(pdfBytes, signer, {
            signatureAppearance: {
              text: 'Robustness test',
              position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
            },
          })
        ).rejects.toThrow();
      });
    }
  });

  // ─── Malformed — should not hang ───
  describe('malformed — should not hang', () => {
    for (const { relativePath, fullPath } of malformed) {
      it(relativePath, async () => {
        const pdfBytes = new Uint8Array(fs.readFileSync(fullPath));
        try {
          await signPDFWithPDFBox(pdfBytes, signer, {
            signatureAppearance: {
              text: 'Robustness test',
              position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
            },
          });
        } catch {
          // Any error is fine — we just verified it didn't hang
        }
      });
    }
  });
});
