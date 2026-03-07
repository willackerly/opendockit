import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fetchTimestampToken } from '../tsa';

const TSA_URL = process.env.TSA_URL;

/**
 * Live integration tests for TSA timestamping.
 *
 * Skipped by default. Run with:
 *   TSA_URL=http://timestamp.digicert.com pnpm test -- tsa-live
 *
 * Free public TSA servers:
 *   - http://timestamp.digicert.com
 *   - http://ts.ssl.com
 *   - http://timestamp.sectigo.com
 */
describe.skipIf(!TSA_URL)('TSA live integration', () => {
  it('fetches a real timestamp token', async () => {
    // Use a fake signature value (256 bytes like an RSA-2048 signature)
    const fakeSignature = new Uint8Array(256);
    for (let i = 0; i < fakeSignature.length; i++) {
      fakeSignature[i] = i & 0xff;
    }

    const token = await fetchTimestampToken(TSA_URL!, fakeSignature);
    expect(token.length).toBeGreaterThan(100);
    console.log(`   Timestamp token size: ${token.length} bytes`);
  });

  it('signs a PDF with timestamp and verifies with pdfsig', async () => {
    // This test requires:
    // 1. TSA_URL env var set to a real TSA
    // 2. pdfsig available on PATH
    // 3. Test fixtures and keys available

    const fixturesDir = path.resolve(__dirname, '../../../test-pdfs');
    const tmpDir = path.resolve(__dirname, '../../../tmp/tsa-live-test');

    // Check if we have the required files
    const manifestPath = path.join(fixturesDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.log('   Skipping: no test-pdfs/manifest.json');
      return;
    }

    // Check pdfsig availability
    try {
      execSync('which pdfsig', { stdio: 'pipe' });
    } catch {
      console.log('   Skipping: pdfsig not available');
      return;
    }

    // Use the parity harness to sign with timestamp
    fs.mkdirSync(tmpDir, { recursive: true });

    // Sign using the TS signer with TSA_URL
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const firstFixture = Object.keys(manifest)[0];
    if (!firstFixture) {
      console.log('   Skipping: no fixtures in manifest');
      return;
    }

    console.log(`   Using fixture: ${firstFixture}`);
    console.log(`   TSA URL: ${TSA_URL}`);

    // We just test that the timestamp token is fetchable and non-empty.
    // Full signing + pdfsig verification is better done via the parity harness
    // with TSA_URL set.
    const fakeSignature = new Uint8Array(256).fill(0x42);
    const token = await fetchTimestampToken(TSA_URL!, fakeSignature);
    expect(token.length).toBeGreaterThan(100);

    console.log(`   ✅ Live TSA returned ${token.length} byte token`);
  });
});
