import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { compareFixtures } from '../../testing/parity-runner';

describe('PDFBox parity harness', () => {
  it('generates deterministic TS output for wire-instructions', async () => {
    const results = await compareFixtures({
      fixtureId: 'wire-instructions',
      skipJava: true,
      tempDir: path.join('tmp', 'parity-smoke'),
      log: () => {},
    });

    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result.ts.sha256).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);
});
