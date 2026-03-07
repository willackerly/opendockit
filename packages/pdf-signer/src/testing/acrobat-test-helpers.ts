import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const adobeAutoScript = path.resolve(repoRoot, 'scripts', 'adobe-auto.py');

// ---------------------------------------------------------------------------
// Acrobat availability
// ---------------------------------------------------------------------------

let _acrobatAvailable: boolean | null = null;

/**
 * Check if Adobe Acrobat automation is available.
 * Requires macOS + Acrobat installed + adobe-auto.py script present.
 */
export function isAcrobatAvailable(): boolean {
  if (_acrobatAvailable !== null) return _acrobatAvailable;

  // macOS only
  if (process.platform !== 'darwin') {
    _acrobatAvailable = false;
    return false;
  }

  // Check script exists
  if (!fs.existsSync(adobeAutoScript)) {
    _acrobatAvailable = false;
    return false;
  }

  // Check Acrobat is installed
  try {
    const result = execFileSync('mdfind', [
      'kMDItemCFBundleIdentifier == "com.adobe.Acrobat.Pro"',
    ], { stdio: 'pipe', timeout: 5_000 });
    _acrobatAvailable = result.toString().trim().length > 0;
  } catch {
    _acrobatAvailable = false;
  }

  return _acrobatAvailable;
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface AcrobatValidationResult {
  opened: boolean;
  numPages: number | null;
  sigFields: string[];
  sigStatus: Record<string, number>;
  sigInfo: Record<string, string>;
  screenshotPath: string | null;
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * Open a PDF in Adobe Acrobat, validate all signatures, and return results.
 *
 * Uses adobe-auto.py validate which:
 * 1. Opens the PDF
 * 2. Adaptive polling (up to 15s) until Acrobat is responsive and sig fields found
 * 3. Queries each signature field via JS bridge
 * 4. Takes a screenshot
 * 5. Returns structured results
 *
 * @param pdfPath       Absolute path to the PDF file
 * @param screenshotDir Optional directory for screenshot output
 * @returns Parsed validation results
 */
export function validateInAcrobat(
  pdfPath: string,
  screenshotDir?: string,
): AcrobatValidationResult {
  const screenshotPath = screenshotDir
    ? path.join(screenshotDir, `${path.basename(pdfPath, '.pdf')}-acrobat.png`)
    : path.join(os.tmpdir(), `pdfbox-acrobat-${Date.now()}.png`);

  // Try validate with retries. Acrobat can become unresponsive after
  // many rapid open/close cycles. On failure, force-kill and restart.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // Force restart Acrobat before retry
      ensureAcrobatReady();
    }

    try {
      const output = execFileSync('python3', [
        adobeAutoScript,
        'validate',
        pdfPath,
        screenshotPath,
      ], {
        stdio: 'pipe',
        timeout: 45_000,
        encoding: 'utf-8',
      });

      const result = parseValidateOutput(output, screenshotPath);
      if (result.opened) return result;

      // Open failed — will retry with restart
    } catch {
      // validate command itself failed — will retry with restart
    }
  }

  // All attempts exhausted
  return { opened: false, numPages: null, sigFields: [], sigStatus: {}, sigInfo: {}, screenshotPath: null };
}

/**
 * Open a PDF in Adobe Acrobat.
 */
export function openInAcrobat(pdfPath: string): void {
  execFileSync('python3', [adobeAutoScript, 'open', pdfPath], {
    stdio: 'pipe',
    timeout: 15_000,
  });
}

/**
 * Dismiss any open Acrobat dialogs (update prompts, trust warnings, etc.)
 * by sending Escape/Return keystrokes. Safe to call when no dialogs are open.
 */
export function dismissAcrobatDialogs(): void {
  try {
    execFileSync('python3', [adobeAutoScript, 'dismiss'], {
      stdio: 'pipe',
      timeout: 15_000,
    });
  } catch {
    // Best-effort — dialogs may not exist
  }
}

/**
 * Close the frontmost Acrobat document.
 * Uses two strategies: AppleScript `close every document` (reliable) then Cmd+W fallback.
 */
export function closeAcrobatDoc(): void {
  // Primary: use Acrobat's AppleScript dictionary — more reliable than Cmd+W
  try {
    execFileSync('osascript', ['-e', 'tell application "Adobe Acrobat" to close every document saving no'], {
      stdio: 'pipe',
      timeout: 10_000,
    });
  } catch {
    // Fallback: Cmd+W via adobe-auto.py
    try {
      execFileSync('python3', [adobeAutoScript, 'close'], {
        stdio: 'pipe',
        timeout: 10_000,
      });
    } catch {
      // Ignore errors on close — document may already be closed
    }
  }
}

/**
 * Ensure Acrobat is running and responsive. If not, kill and restart it.
 * Returns true if Acrobat is ready.
 */
export function ensureAcrobatReady(): boolean {
  // Dismiss any dialogs first — they can block the JS bridge
  dismissAcrobatDialogs();

  // Try a simple JS expression to test responsiveness
  try {
    const result = execFileSync('python3', [adobeAutoScript, 'js', '1+1'], {
      stdio: 'pipe',
      timeout: 8_000,
      encoding: 'utf-8',
    }).trim();
    if (result.includes('2')) return true;
  } catch {
    // Acrobat not responding
  }

  // Force kill (SIGKILL) — Acrobat can get stuck in states where SIGTERM doesn't work
  try {
    execFileSync('pkill', ['-9', '-f', 'Adobe Acrobat'], { stdio: 'pipe', timeout: 5_000 });
  } catch {
    // May not be running
  }

  // Wait for process to fully terminate
  for (let i = 0; i < 8; i++) {
    try {
      execFileSync('pgrep', ['-f', 'AdobeAcrobat'], { stdio: 'pipe', timeout: 2_000 });
      // Still running — wait
      execFileSync('sleep', ['1'], { stdio: 'pipe', timeout: 3_000 });
    } catch {
      // Process gone — good
      break;
    }
  }

  // Restart
  try {
    execFileSync('open', ['-a', 'Adobe Acrobat'], { stdio: 'pipe', timeout: 5_000 });
  } catch {
    return false;
  }

  // Wait for Acrobat to be responsive — can take several seconds after cold start
  for (let i = 0; i < 15; i++) {
    try {
      execFileSync('sleep', ['1'], { stdio: 'pipe', timeout: 3_000 });
      const result = execFileSync('python3', [adobeAutoScript, 'js', '1+1'], {
        stdio: 'pipe',
        timeout: 8_000,
        encoding: 'utf-8',
      }).trim();
      if (result.includes('2')) return true;
    } catch {
      // Keep waiting
    }
  }

  return false;
}

/**
 * Take a screenshot of the frontmost Acrobat window.
 */
export function screenshotAcrobat(outputPath?: string): string {
  const p = outputPath || path.join(os.tmpdir(), `pdfbox-acrobat-${Date.now()}.png`);
  execFileSync('python3', [adobeAutoScript, 'screenshot', p], {
    stdio: 'pipe',
    timeout: 10_000,
  });
  return p;
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

/**
 * Parse the stdout output from `adobe-auto.py validate` into structured data.
 *
 * Expected format:
 *   Validating: /path/to/file.pdf
 *   Opened: True
 *   Pages: 1
 *   Sig fields: ['Signature1']
 *   Signature1 validate: validate=4|name=...|...
 *   Signature1 info: ...
 *   Screenshot: /tmp/out.png
 */
function parseValidateOutput(output: string, screenshotPath: string): AcrobatValidationResult {
  const lines = output.split('\n').map(l => l.trim());

  const result: AcrobatValidationResult = {
    opened: false,
    numPages: null,
    sigFields: [],
    sigStatus: {},
    sigInfo: {},
    screenshotPath: null,
  };

  for (const line of lines) {
    if (line.startsWith('Opened:')) {
      result.opened = line.includes('True');
    } else if (line.startsWith('Pages:')) {
      const n = parseInt(line.split(':')[1].trim(), 10);
      result.numPages = isNaN(n) ? null : n;
    } else if (line.startsWith('Sig fields:')) {
      // Parse Python list syntax: ['Signature1', 'Signature2']
      const match = line.match(/\[([^\]]*)\]/);
      if (match) {
        result.sigFields = match[1]
          .split(',')
          .map(s => s.trim().replace(/^'|'$/g, ''))
          .filter(s => s.length > 0);
      }
    } else if (line.includes('validate:')) {
      // "Signature1 validate: 1" (bare number from adobe-auto.py)
      const fieldMatch = line.match(/^\s*(\S+)\s+validate:\s*(.+)/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const valStr = fieldMatch[2].trim();
        // Try bare number first (actual adobe-auto.py output), then validate=N prefix
        const bareNum = parseInt(valStr, 10);
        if (!isNaN(bareNum)) {
          result.sigStatus[fieldName] = bareNum;
        } else {
          const codeMatch = valStr.match(/validate=(\d+)/);
          if (codeMatch) {
            result.sigStatus[fieldName] = parseInt(codeMatch[1], 10);
          }
        }
      }
    } else if (line.includes('info:')) {
      const fieldMatch = line.match(/^\s*(\S+)\s+info:\s*(.+)/);
      if (fieldMatch) {
        result.sigInfo[fieldMatch[1]] = fieldMatch[2];
      }
    } else if (line.startsWith('Screenshot:')) {
      result.screenshotPath = line.split(':').slice(1).join(':').trim();
    }
  }

  // Verify screenshot exists
  if (fs.existsSync(screenshotPath)) {
    result.screenshotPath = screenshotPath;
  }

  return result;
}

/**
 * Write PDF bytes to a temporary file and return the path.
 * Caller is responsible for cleanup.
 */
export function writeTempPdf(pdfBytes: Uint8Array, name = 'test'): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfbox-acrobat-'));
  const pdfPath = path.join(tmpDir, `${name}.pdf`);
  fs.writeFileSync(pdfPath, pdfBytes);
  return pdfPath;
}

/**
 * Clean up a temp file and its parent directory.
 */
export function cleanupTempPdf(pdfPath: string): void {
  try {
    fs.unlinkSync(pdfPath);
    fs.rmdirSync(path.dirname(pdfPath));
  } catch {
    // Best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Parsed signature info
// ---------------------------------------------------------------------------

export interface ParsedSigInfo {
  validate: number;
  name: string;
  reason: string;
  date: string;
  location: string;
}

/**
 * Parse the pipe-delimited sig info string from `validateInAcrobat().sigInfo[field]`
 * into structured data.
 *
 * Expected format: `validate=N|name=...|reason=...|date=...|location=...`
 */
export function parseSigInfo(raw: string): ParsedSigInfo {
  const result: ParsedSigInfo = {
    validate: 0,
    name: '',
    reason: '',
    date: '',
    location: '',
  };

  for (const part of raw.split('|')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    switch (key) {
      case 'validate':
        result.validate = parseInt(value, 10) || 0;
        break;
      case 'name':
        result.name = value;
        break;
      case 'reason':
        result.reason = value;
        break;
      case 'date':
        result.date = value;
        break;
      case 'location':
        result.location = value;
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Crash log monitoring
// ---------------------------------------------------------------------------

const DIAGNOSTIC_REPORTS_DIR = path.join(os.homedir(), 'Library', 'Logs', 'DiagnosticReports');
const RETIRED_REPORTS_DIR = path.join(DIAGNOSTIC_REPORTS_DIR, 'Retired');

/**
 * Snapshot of crash report files at a point in time.
 * Used to detect new crashes that occur during a test.
 */
export interface CrashLogSnapshot {
  /** Timestamp when snapshot was taken */
  timestamp: number;
  /** Set of known .ips file paths (both DiagnosticReports and Retired) */
  knownFiles: Set<string>;
}

/**
 * Take a snapshot of all Acrobat-related crash reports.
 * Call this BEFORE running a test, then call `detectNewCrashes()` AFTER.
 */
export function snapshotCrashLogs(): CrashLogSnapshot {
  const knownFiles = new Set<string>();

  for (const dir of [DIAGNOSTIC_REPORTS_DIR, RETIRED_REPORTS_DIR]) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.includes('Acrobat') && entry.endsWith('.ips')) {
          knownFiles.add(path.join(dir, entry));
        }
      }
    } catch {
      // Directory may not exist or be unreadable
    }
  }

  return { timestamp: Date.now(), knownFiles };
}

/**
 * Detect new Acrobat crash reports that appeared after the snapshot was taken.
 * Returns an array of crash report summaries (empty if no new crashes).
 */
export function detectNewCrashes(snapshot: CrashLogSnapshot): CrashReport[] {
  const newCrashes: CrashReport[] = [];

  for (const dir of [DIAGNOSTIC_REPORTS_DIR, RETIRED_REPORTS_DIR]) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (!entry.includes('Acrobat') || !entry.endsWith('.ips')) continue;
        const fullPath = path.join(dir, entry);
        if (snapshot.knownFiles.has(fullPath)) continue;

        // New crash file — check if it was created after our snapshot
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs < snapshot.timestamp - 5000) continue; // 5s grace for clock skew

          // Parse basic info from the .ips file
          const content = fs.readFileSync(fullPath, 'utf-8');
          newCrashes.push(parseCrashReport(fullPath, content));
        } catch {
          // File may have been moved/deleted between readdir and stat
        }
      }
    } catch {
      // Directory unreadable
    }
  }

  return newCrashes;
}

/**
 * Summary of an Acrobat crash report.
 */
export interface CrashReport {
  /** Full path to the .ips file */
  path: string;
  /** Process name (e.g., "AdobeAcrobat") */
  process: string;
  /** Exception type (e.g., "EXC_BAD_ACCESS (SIGSEGV)") */
  exception: string;
  /** Crash timestamp from the report */
  crashTimestamp: string;
  /** First few lines of the crash thread's backtrace */
  backtraceSummary: string;
}

/**
 * Parse a macOS .ips crash report file for key fields.
 */
function parseCrashReport(filePath: string, content: string): CrashReport {
  const report: CrashReport = {
    path: filePath,
    process: '',
    exception: '',
    crashTimestamp: '',
    backtraceSummary: '',
  };

  // .ips files can be JSON (newer) or plain text (older)
  // Try JSON first (macOS 13+ format)
  try {
    // The first line is often a JSON header, rest is the report
    const firstNewline = content.indexOf('\n');
    if (firstNewline > 0 && content[0] === '{') {
      const header = JSON.parse(content.slice(0, firstNewline));
      report.crashTimestamp = header.captureTime || header.timestamp || '';
      report.process = header.name || '';
    }
  } catch {
    // Not JSON header — fall through to text parsing
  }

  // Text-based parsing for both formats
  for (const line of content.split('\n').slice(0, 50)) {
    if (line.startsWith('Process:') && !report.process) {
      report.process = line.replace('Process:', '').trim().split(/\s/)[0];
    } else if (line.startsWith('Exception Type:')) {
      report.exception = line.replace('Exception Type:', '').trim();
    } else if (line.startsWith('Date/Time:') && !report.crashTimestamp) {
      report.crashTimestamp = line.replace('Date/Time:', '').trim();
    }
  }

  // Extract crashed thread backtrace (first 5 frames)
  const crashedThreadMatch = content.match(/Thread \d+ Crashed[^\n]*\n((?:.*\n){1,5})/);
  if (crashedThreadMatch) {
    report.backtraceSummary = crashedThreadMatch[1].trim();
  }

  return report;
}

/**
 * Format crash reports for test output / assertion messages.
 */
export function formatCrashReports(crashes: CrashReport[]): string {
  if (crashes.length === 0) return 'No Acrobat crashes detected.';

  const lines = [`${crashes.length} Acrobat crash(es) detected:`];
  for (const crash of crashes) {
    lines.push(`  File: ${crash.path}`);
    lines.push(`  Process: ${crash.process}`);
    lines.push(`  Exception: ${crash.exception}`);
    lines.push(`  Time: ${crash.crashTimestamp}`);
    if (crash.backtraceSummary) {
      lines.push(`  Backtrace:`);
      for (const frame of crash.backtraceSummary.split('\n')) {
        lines.push(`    ${frame}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Run arbitrary JS in Acrobat
// ---------------------------------------------------------------------------

/**
 * Execute a JavaScript expression in Adobe Acrobat via the `adobe-auto.py js` command.
 * Returns the stdout output (trimmed).
 *
 * IMPORTANT: Use single quotes inside the JS expression — double quotes
 * break AppleScript escaping.
 */
export function runJsInAcrobat(js: string): string {
  return execFileSync('python3', [adobeAutoScript, 'js', js], {
    stdio: 'pipe',
    timeout: 15_000,
    encoding: 'utf-8',
  }).trim();
}
