import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareFixtures } from '../testing/parity-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

async function main(): Promise<void> {
  const originalConsoleLog = console.log;
  if (!process.env.PDFBOX_TS_VERBOSE) {
    console.log = () => {};
  }
  let results;
  try {
    results = await compareFixtures({
      fixtureId: undefined,
      failOnMismatch: false,
      includeAllOutcomes: true,
      log: () => {},
      manifestPath: path.join(repoRoot, 'test-pdfs', 'manifest.json'),
      tempDir: path.join(repoRoot, 'tmp'),
      javaBinary: process.env.JAVA,
    });
  } finally {
    console.log = originalConsoleLog;
  }

  let passed = 0;
  let failed = 0;
  const histogram = new Map<string, number>();
  const failing: Array<{ id: string; mismatches: string[] }> = [];

  for (const result of results) {
    if (!result.javaRan) {
      continue;
    }
    if (result.mismatches.length === 0) {
      passed += 1;
    } else {
      failed += 1;
      failing.push({ id: result.testCase.id, mismatches: result.mismatches });
      for (const mismatch of result.mismatches) {
        histogram.set(mismatch, (histogram.get(mismatch) ?? 0) + 1);
      }
    }
  }

  console.log(`Fixtures examined: ${passed + failed}`);
  console.log(`  ✅ Pass: ${passed}`);
  console.log(`  ⚠️  Fail: ${failed}`);

  if (histogram.size > 0) {
    console.log('\nMismatch histogram:');
    const rows = [...histogram.entries()].sort((a, b) => b[1] - a[1]);
    for (const [mismatch, count] of rows) {
      console.log(`  • ${mismatch}: ${count}`);
    }
  }

  if (failing.length > 0) {
    console.log('\nFailing fixtures:');
    for (const { id, mismatches } of failing) {
      console.log(`  - ${id}: ${mismatches.join(', ')}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
