import { bench, describe } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { OpcPackageReader } from '@opendockit/core/opc';
import { parsePresentation } from '@opendockit/pptx';

/**
 * Benchmark full PPTX file load-to-IR pipeline.
 */

const pptxPath = path.resolve(__dirname, '../../../../test-data/basic-shapes.pptx');
const pptxBuffer = readFileSync(pptxPath);

describe('Full PPTX Load', () => {
  bench(
    'load basic-shapes.pptx end-to-end',
    async () => {
      const pkg = await OpcPackageReader.open(pptxBuffer);
      await parsePresentation(pkg);
    },
    { warmupIterations: 2, iterations: 20 }
  );

  bench(
    'OPC open only (basic-shapes.pptx)',
    async () => {
      await OpcPackageReader.open(pptxBuffer);
    },
    { warmupIterations: 3, iterations: 50 }
  );
});
