import { bench, describe } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { OpcPackageReader } from '@opendockit/core/opc';

/**
 * Benchmark OPC package reader — ZIP opening + part extraction.
 *
 * Uses the real basic-shapes.pptx fixture for realistic ZIP parsing.
 */

const pptxPath = path.resolve(__dirname, '../../../../test-data/basic-shapes.pptx');
const pptxBuffer = readFileSync(pptxPath);

describe('OPC Package Reader', () => {
  bench(
    'open PPTX ZIP package',
    async () => {
      await OpcPackageReader.open(pptxBuffer);
    },
    { warmupIterations: 3, iterations: 50 }
  );

  bench(
    'open + list parts',
    async () => {
      const pkg = await OpcPackageReader.open(pptxBuffer);
      pkg.listParts();
    },
    { warmupIterations: 3, iterations: 50 }
  );

  bench(
    'open + read root relationships',
    async () => {
      const pkg = await OpcPackageReader.open(pptxBuffer);
      await pkg.getRootRelationships();
    },
    { warmupIterations: 3, iterations: 50 }
  );
});
