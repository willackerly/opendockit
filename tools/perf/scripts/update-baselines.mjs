#!/usr/bin/env node

/**
 * Run vitest bench with JSON reporter and save results to perf-baselines.json.
 *
 * Usage: node tools/perf/scripts/update-baselines.mjs
 *   (or: pnpm perf:update from repo root)
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const perfDir = path.resolve(__dirname, '..');
const baselinesPath = path.resolve(perfDir, 'baselines/perf-baselines.json');
const outputJsonPath = path.resolve(perfDir, '.bench-results.json');

console.log('Running benchmarks...\n');

try {
  execSync(
    `npx vitest bench --config ${path.resolve(perfDir, 'vitest.config.ts')} --reporter=json --outputFile=${outputJsonPath}`,
    {
      cwd: path.resolve(perfDir, '../..'),
      stdio: 'inherit',
      timeout: 300_000,
    }
  );
} catch {
  // vitest bench may exit with non-zero even on success with JSON reporter
}

let results;
try {
  const raw = readFileSync(outputJsonPath, 'utf-8');
  results = JSON.parse(raw);
} catch (err) {
  console.error('Failed to read bench results JSON:', err.message);
  console.error(`Expected output at: ${outputJsonPath}`);
  process.exit(1);
}

// Extract benchmark entries from vitest JSON output
const benchmarks = {};

const testResults = results.testResults ?? [];
for (const suite of testResults) {
  const suiteName = suite.name ?? 'unknown';
  const assertionResults = suite.assertionResults ?? [];
  for (const test of assertionResults) {
    const fullName = test.fullName ?? test.ancestorTitles?.join(' > ') + ' > ' + test.title;
    const meta = test.meta?.benchmark ?? test.benchmark;
    if (meta) {
      benchmarks[fullName] = {
        hz: meta.hz,
        mean: meta.mean,
        p75: meta.p75,
        p99: meta.p99,
        rme: meta.rme,
        samples: meta.samples?.length ?? meta.sampleCount,
      };
    }
  }
}

const output = {
  _comment: 'Auto-generated. Do not edit manually. Run: pnpm perf:update',
  updatedAt: new Date().toISOString(),
  benchmarks,
};

writeFileSync(baselinesPath, JSON.stringify(output, null, 2) + '\n');
console.log(`\nBaselines written to ${baselinesPath}`);
console.log(`  ${Object.keys(benchmarks).length} benchmark(s) recorded.`);
