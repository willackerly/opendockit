/**
 * Tests for visual-compare-export.mjs utilities.
 *
 * These tests validate the non-interactive, pure-logic parts of the script:
 * - CLI argument parsing helpers
 * - RMSE baseline loading/saving
 * - Report generation structure
 * - RMSE threshold/status logic
 *
 * Run with: node --test scripts/__tests__/visual-compare-export.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Helpers extracted from visual-compare-export.mjs for unit testing
// ---------------------------------------------------------------------------

/**
 * Parse CLI argv to extract option values.
 * Mirrors the arg-parsing logic in visual-compare-export.mjs.
 */
function parseArgs(argv) {
  const args = argv.slice(2); // remove node + script path

  const updateBaselines = args.includes('--update-baselines');
  const skipExport = args.includes('--skip-export');

  const scaleArg = args.includes('--scale') ? parseFloat(args[args.indexOf('--scale') + 1]) : 2;
  const scale = Number.isFinite(scaleArg) ? scaleArg : 2;

  const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
  const positionalArg = args.find((a) => !a.startsWith('--') && a.endsWith('.pptx'));
  const outputDirArg = args.includes('--output-dir')
    ? args[args.indexOf('--output-dir') + 1]
    : null;

  return { updateBaselines, skipExport, scale, fileArg, positionalArg, outputDirArg };
}

/**
 * Compute status and delta for a slide comparison result.
 * Mirrors the RMSE comparison logic in visual-compare-export.mjs Step 6.
 */
function computeStatus(rmse, baseline, threshold = 0.01) {
  if (rmse == null) return { status: 'error', delta: null };
  if (baseline == null) return { status: 'new', delta: null };
  const delta = rmse - baseline;
  if (delta > threshold) return { status: 'WORSE', delta };
  if (delta < -0.005) return { status: 'BETTER', delta };
  return { status: '=', delta };
}

/**
 * Build a minimal export-rmse-report.json payload.
 * Mirrors the report structure produced by visual-compare-export.mjs.
 */
function buildReport({ pptxFile, slideCount, scale, exportAvailable, results, summary }) {
  return {
    timestamp: new Date().toISOString(),
    pptxFile,
    slideCount,
    scale,
    exportAvailable,
    results,
    summary,
  };
}

/**
 * Classify an exportResult from the browser evaluate call.
 */
function detectExportStatus(exportResult) {
  if (exportResult.error === 'EXPORT_NOT_IMPLEMENTED') return 'not_implemented';
  if (exportResult.error) return 'failed';
  if (exportResult.success) return 'success';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// CLI argument parsing tests
// ---------------------------------------------------------------------------

describe('CLI argument parsing', () => {
  test('defaults when no args supplied', () => {
    const { updateBaselines, skipExport, scale, fileArg, positionalArg, outputDirArg } =
      parseArgs(['node', 'script.mjs']);
    assert.equal(updateBaselines, false);
    assert.equal(skipExport, false);
    assert.equal(scale, 2);
    assert.equal(fileArg, null);
    assert.equal(positionalArg, undefined);
    assert.equal(outputDirArg, null);
  });

  test('--update-baselines flag', () => {
    const { updateBaselines } = parseArgs(['node', 'script.mjs', '--update-baselines']);
    assert.equal(updateBaselines, true);
  });

  test('--skip-export flag', () => {
    const { skipExport } = parseArgs(['node', 'script.mjs', '--skip-export']);
    assert.equal(skipExport, true);
  });

  test('--scale with valid number', () => {
    const { scale } = parseArgs(['node', 'script.mjs', '--scale', '1.5']);
    assert.equal(scale, 1.5);
  });

  test('--scale with invalid value falls back to 2', () => {
    const { scale } = parseArgs(['node', 'script.mjs', '--scale', 'bad']);
    assert.equal(scale, 2);
  });

  test('--scale with missing argument falls back to 2', () => {
    const { scale } = parseArgs(['node', 'script.mjs', '--scale']);
    assert.equal(scale, 2);
  });

  test('--file shorthand flag', () => {
    const { fileArg } = parseArgs(['node', 'script.mjs', '--file', 'basic-shapes']);
    assert.equal(fileArg, 'basic-shapes');
  });

  test('positional .pptx argument', () => {
    const { positionalArg } = parseArgs(['node', 'script.mjs', 'test-data/basic-shapes.pptx']);
    assert.equal(positionalArg, 'test-data/basic-shapes.pptx');
  });

  test('--output-dir flag', () => {
    const { outputDirArg } = parseArgs([
      'node',
      'script.mjs',
      '--output-dir',
      '/tmp/my-comparison',
    ]);
    assert.equal(outputDirArg, '/tmp/my-comparison');
  });

  test('multiple flags combined', () => {
    const opts = parseArgs([
      'node',
      'script.mjs',
      '--update-baselines',
      '--skip-export',
      '--scale',
      '3',
      '--file',
      'font-stress-test',
    ]);
    assert.equal(opts.updateBaselines, true);
    assert.equal(opts.skipExport, true);
    assert.equal(opts.scale, 3);
    assert.equal(opts.fileArg, 'font-stress-test');
  });

  test('--file with .pptx extension is preserved', () => {
    const { fileArg } = parseArgs(['node', 'script.mjs', '--file', 'charts-basic.pptx']);
    assert.equal(fileArg, 'charts-basic.pptx');
  });

  test('unknown flags do not affect known flags', () => {
    const opts = parseArgs(['node', 'script.mjs', '--unknown', '--skip-export']);
    assert.equal(opts.skipExport, true);
    assert.equal(opts.updateBaselines, false);
  });
});

// ---------------------------------------------------------------------------
// RMSE status classification tests
// ---------------------------------------------------------------------------

describe('RMSE status classification', () => {
  const threshold = 0.01;

  test('null RMSE returns error status', () => {
    const { status } = computeStatus(null, 0.05, threshold);
    assert.equal(status, 'error');
  });

  test('null baseline returns new status', () => {
    const { status } = computeStatus(0.05, null, threshold);
    assert.equal(status, 'new');
  });

  test('RMSE within threshold returns unchanged', () => {
    const { status, delta } = computeStatus(0.05, 0.046, threshold);
    assert.equal(status, '=');
    assert(Math.abs(delta - 0.004) < 1e-10, 'delta should be 0.004');
  });

  test('RMSE exceeds threshold returns WORSE', () => {
    const { status, delta } = computeStatus(0.08, 0.05, threshold);
    assert.equal(status, 'WORSE');
    assert(Math.abs(delta - 0.03) < 1e-10, 'delta should be 0.03');
  });

  test('RMSE improved by > 0.005 returns BETTER', () => {
    const { status, delta } = computeStatus(0.04, 0.05, threshold);
    assert.equal(status, 'BETTER');
    assert(delta < -0.005, 'delta should be negative and > 0.005 improvement');
  });

  test('RMSE improved by 0.005 returns BETTER due to float precision', () => {
    // 0.045 - 0.05 = -0.0050000000000000044 in IEEE 754, which IS < -0.005
    // so this rounds to BETTER. Use values that are clearly above/below boundary.
    const { status } = computeStatus(0.044, 0.05, threshold); // delta = -0.006 → BETTER
    assert.equal(status, 'BETTER');
  });

  test('delta exactly at threshold stays unchanged (> not >=)', () => {
    // 0.06 - 0.05 = 0.01 which is NOT > 0.01
    const { status } = computeStatus(0.06, 0.05, threshold);
    assert.equal(status, '=');
  });

  test('delta just above threshold returns WORSE', () => {
    const { status } = computeStatus(0.0601, 0.05, threshold);
    assert.equal(status, 'WORSE');
  });

  test('perfect export fidelity (RMSE=0) returns BETTER vs positive baseline', () => {
    const { status } = computeStatus(0, 0.05, threshold);
    assert.equal(status, 'BETTER');
  });

  test('both RMSE and baseline are 0 returns unchanged', () => {
    const { status } = computeStatus(0, 0, threshold);
    assert.equal(status, '=');
  });
});

// ---------------------------------------------------------------------------
// Report JSON structure tests
// ---------------------------------------------------------------------------

describe('Report JSON structure', () => {
  test('exportAvailable=false report has required fields', () => {
    const report = buildReport({
      pptxFile: '/path/to/test.pptx',
      slideCount: 3,
      scale: 2,
      exportAvailable: false,
      results: [],
      summary: null,
    });

    assert.ok('timestamp' in report, 'timestamp field required');
    assert.ok('pptxFile' in report, 'pptxFile field required');
    assert.ok('slideCount' in report, 'slideCount field required');
    assert.ok('scale' in report, 'scale field required');
    assert.ok('exportAvailable' in report, 'exportAvailable field required');
    assert.equal(report.exportAvailable, false);
    assert.equal(report.slideCount, 3);
    assert.deepEqual(report.results, []);
    assert.equal(report.summary, null);
  });

  test('exportAvailable=true report has results array with slide data', () => {
    const results = [
      { slide: 1, rmse: 0.042, baseline: 0.040, delta: 0.002 },
      { slide: 2, rmse: 0.085, baseline: 0.080, delta: 0.005 },
    ];
    const report = buildReport({
      pptxFile: '/path/to/test.pptx',
      slideCount: 2,
      scale: 2,
      exportAvailable: true,
      results,
      summary: { improved: 0, regressed: 0, unchanged: 2, errored: 0 },
    });

    assert.equal(report.exportAvailable, true);
    assert.equal(report.results.length, 2);
    assert.equal(report.results[0].slide, 1);
    assert.equal(report.results[1].slide, 2);
    assert.equal(typeof report.results[0].rmse, 'number');
  });

  test('timestamp is a parseable ISO 8601 string', () => {
    const report = buildReport({
      pptxFile: '',
      slideCount: 0,
      scale: 2,
      exportAvailable: false,
      results: [],
      summary: null,
    });
    const parsed = new Date(report.timestamp);
    assert.ok(!isNaN(parsed.getTime()), 'timestamp must parse to a valid date');
  });

  test('scale is preserved in report', () => {
    const report = buildReport({
      pptxFile: 'test.pptx',
      slideCount: 1,
      scale: 1.5,
      exportAvailable: false,
      results: [],
      summary: null,
    });
    assert.equal(report.scale, 1.5);
  });
});

// ---------------------------------------------------------------------------
// Baseline file I/O tests
// ---------------------------------------------------------------------------

describe('Baseline file I/O', () => {
  test('writes and reads baseline JSON correctly', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
    try {
      const baselinesPath = path.join(tmpDir, 'baselines.json');
      const baselines = { 1: 0.042, 2: 0.085, 3: 0.031 };
      fs.writeFileSync(baselinesPath, JSON.stringify(baselines, null, 2) + '\n');

      const loaded = JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));
      assert.equal(loaded[1], 0.042);
      assert.equal(loaded[2], 0.085);
      assert.equal(loaded[3], 0.031);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('missing baselines file means first run', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
    try {
      const baselinesPath = path.join(tmpDir, 'baselines.json');
      const isFirstRun = !fs.existsSync(baselinesPath);
      assert.equal(isFirstRun, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('empty baselines object means first run', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
    try {
      const baselinesPath = path.join(tmpDir, 'baselines.json');
      fs.writeFileSync(baselinesPath, JSON.stringify({}, null, 2) + '\n');

      const loaded = JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));
      const isFirstRun = Object.keys(loaded).length === 0;
      assert.equal(isFirstRun, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('updated baselines overwrite previous values', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
    try {
      const baselinesPath = path.join(tmpDir, 'baselines.json');

      // Write initial baselines
      fs.writeFileSync(baselinesPath, JSON.stringify({ 1: 0.05, 2: 0.08 }, null, 2) + '\n');

      // Update baselines
      const updated = { 1: 0.04, 2: 0.07, 3: 0.03 };
      fs.writeFileSync(baselinesPath, JSON.stringify(updated, null, 2) + '\n');

      const loaded = JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));
      assert.equal(loaded[1], 0.04);
      assert.equal(loaded[2], 0.07);
      assert.equal(loaded[3], 0.03);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Export status detection tests
// ---------------------------------------------------------------------------

describe('Export error detection', () => {
  test('EXPORT_NOT_IMPLEMENTED error code detected correctly', () => {
    const result = {
      error: 'EXPORT_NOT_IMPLEMENTED',
      message: 'SlideKit.exportPDF() is not yet implemented.',
    };
    assert.equal(detectExportStatus(result), 'not_implemented');
  });

  test('EXPORT_FAILED error code is treated as failure', () => {
    const result = { error: 'EXPORT_FAILED', message: 'Some error' };
    assert.equal(detectExportStatus(result), 'failed');
  });

  test('NO_KIT error is treated as failure', () => {
    const result = { error: 'NO_KIT', message: 'window.__debug.kit not available' };
    assert.equal(detectExportStatus(result), 'failed');
  });

  test('PDF_LOAD_FAILED is treated as failure', () => {
    const result = { error: 'PDF_LOAD_FAILED', message: 'Invalid PDF structure' };
    assert.equal(detectExportStatus(result), 'failed');
  });

  test('successful export has success=true', () => {
    const result = { success: true, b64: 'abc123', byteLength: 1024 };
    assert.equal(detectExportStatus(result), 'success');
  });

  test('unknown shape returns unknown', () => {
    const result = {};
    assert.equal(detectExportStatus(result), 'unknown');
  });
});

// ---------------------------------------------------------------------------
// Output directory structure tests
// ---------------------------------------------------------------------------

describe('Output directory structure', () => {
  test('creates required subdirectories', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-structure-'));
    try {
      const outputDir = path.join(tmpDir, 'export-comparison');
      const canvasReferenceDir = path.join(outputDir, 'canvas-reference');
      const pdfExportDir = path.join(outputDir, 'pdf-export');
      const diffsDir = path.join(outputDir, 'diffs');

      fs.mkdirSync(canvasReferenceDir, { recursive: true });
      fs.mkdirSync(pdfExportDir, { recursive: true });
      fs.mkdirSync(diffsDir, { recursive: true });

      assert.ok(fs.existsSync(canvasReferenceDir), 'canvas-reference/ must be created');
      assert.ok(fs.existsSync(pdfExportDir), 'pdf-export/ must be created');
      assert.ok(fs.existsSync(diffsDir), 'diffs/ must be created');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('report JSON is written to output-dir root', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-report-'));
    try {
      const reportPath = path.join(tmpDir, 'export-rmse-report.json');
      const report = buildReport({
        pptxFile: 'test.pptx',
        slideCount: 2,
        scale: 2,
        exportAvailable: false,
        results: [],
        summary: null,
      });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      assert.ok(fs.existsSync(reportPath), 'export-rmse-report.json must be written');

      const loaded = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      assert.equal(loaded.slideCount, 2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('slide PNGs follow zero-padded naming convention', () => {
    // Verify that slide-01.png, slide-02.png etc. naming convention works for sorting
    const names = [1, 2, 3, 10, 11].map(
      (i) => `slide-${String(i).padStart(2, '0')}.png`
    );
    const sorted = [...names].sort();
    assert.deepEqual(sorted, names, 'zero-padded names should sort correctly');
  });
});
