import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Simple JFR post-processor: extracts ExecutionSample stack traces filtered to org.apache.pdfbox.*
// Usage: pnpm tsx scripts/process-jfr.ts <input.jfr> <output-dir>

function main() {
  const [input, outDirArg] = process.argv.slice(2);
  if (!input || !outDirArg) {
    console.error('Usage: pnpm tsx scripts/process-jfr.ts <input.jfr> <output-dir>');
    process.exit(1);
  }
  const jfrPath = path.resolve(input);
  const outDir = path.resolve(outDirArg);
  if (!fs.existsSync(jfrPath)) {
    throw new Error(`JFR file not found: ${jfrPath}`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const rawStacks = execSync(`jfr print --events ExecutionSample --stack-depth 64 ${jfrPath}`, {
    encoding: 'utf8',
  });
  const lines = rawStacks.split('\n');
  const filtered: string[] = [];
  for (const line of lines) {
    if (line.includes('org.apache.pdfbox.')) {
      filtered.push(line.trim());
    }
  }
  const stacksPath = path.join(outDir, 'calltrace-stacks.txt');
  fs.writeFileSync(stacksPath, filtered.join('\n'));

  const methodCounts = new Map<string, number>();
  for (const line of filtered) {
    const match = line.match(/org\.apache\.pdfbox\.[\w$.<>]+/);
    if (match) {
      const name = match[0];
      methodCounts.set(name, (methodCounts.get(name) ?? 0) + 1);
    }
  }
  const methodList = Array.from(methodCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${count}\t${name}`);
  const methodsPath = path.join(outDir, 'calltrace-methods.txt');
  fs.writeFileSync(methodsPath, methodList.join('\n'));

  console.log(`Wrote stacks to ${stacksPath}`);
  console.log(`Wrote method counts to ${methodsPath}`);
}

main();
