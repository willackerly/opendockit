import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareFixtures } from '../testing/parity-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    fixtureId: '' as string | null,
    all: false,
    skipJava: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      continue;
    }

    if (arg === '--all') {
      options.all = true;
      continue;
    }
    if (arg === '--skip-java') {
      options.skipJava = true;
      continue;
    }
    if (arg === '--fixture') {
      options.fixtureId = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--fixture=')) {
      options.fixtureId = arg.split('=')[1];
      continue;
    }
    if (!options.fixtureId) {
      options.fixtureId = arg;
    }
  }

  return options;
}
async function main() {
  const { all, fixtureId, skipJava } = parseArgs();
  await compareFixtures({
    fixtureId: fixtureId || undefined,
    skipJava,
    tempDir: path.join(repoRoot, 'tmp'),
    log: console.log,
    javaBinary: process.env.JAVA,
    manifestPath: path.join(repoRoot, 'test-pdfs', 'manifest.json'),
    includeAllOutcomes: all,
    failOnMismatch: !skipJava,
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
