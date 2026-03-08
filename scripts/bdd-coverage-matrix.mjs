#!/usr/bin/env node

/**
 * BDD Coverage Matrix Generator
 *
 * Scans .feature files under features/, parses tags and scenario counts,
 * and outputs a markdown table grouped by @epic and @story tags.
 *
 * Usage: node scripts/bdd-coverage-matrix.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEATURES_DIR = path.resolve(__dirname, '..', 'features');

// ---------------------------------------------------------------------------
// Feature file parser
// ---------------------------------------------------------------------------

/**
 * Parse a .feature file and extract tag/scenario metadata.
 * Returns an object with feature-level tags and an array of scenarios
 * each with their own tags.
 */
function parseFeatureFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const result = {
    filePath: path.relative(FEATURES_DIR, filePath),
    featureName: '',
    featureTags: [],
    scenarios: [],
  };

  let pendingTags = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Collect tags
    if (trimmed.startsWith('@')) {
      const tags = trimmed.split(/\s+/).filter((t) => t.startsWith('@'));
      pendingTags.push(...tags);
      continue;
    }

    // Feature line
    if (trimmed.startsWith('Feature:')) {
      result.featureName = trimmed.replace('Feature:', '').trim();
      result.featureTags = [...pendingTags];
      pendingTags = [];
      continue;
    }

    // Scenario or Scenario Outline
    if (trimmed.startsWith('Scenario:') || trimmed.startsWith('Scenario Outline:')) {
      const scenarioName = trimmed
        .replace('Scenario Outline:', '')
        .replace('Scenario:', '')
        .trim();
      result.scenarios.push({
        name: scenarioName,
        tags: [...pendingTags],
      });
      pendingTags = [];
      continue;
    }

    // Non-tag, non-scenario line -- clear pending tags if it's not blank
    if (trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('|') && !trimmed.startsWith('Given') && !trimmed.startsWith('When') && !trimmed.startsWith('Then') && !trimmed.startsWith('And') && !trimmed.startsWith('But') && !trimmed.startsWith('Background:') && !trimmed.startsWith('Examples:')) {
      // Keep pending tags for description lines following Feature:
    }
  }

  return result;
}

/**
 * Recursively find all .feature files under a directory.
 */
function findFeatureFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFeatureFiles(fullPath));
    } else if (entry.name.endsWith('.feature')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extract a specific tag prefix value, e.g., "@epic:rendering" -> "rendering"
 */
function getTagValue(tags, prefix) {
  for (const tag of tags) {
    if (tag.startsWith(prefix)) {
      return tag.slice(prefix.length);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const featureFiles = findFeatureFiles(FEATURES_DIR);
const parsed = featureFiles.map(parseFeatureFile);

// Build coverage matrix data
const matrixRows = [];

for (const feature of parsed) {
  const allTags = [...feature.featureTags];
  for (const scenario of feature.scenarios) {
    allTags.push(...scenario.tags);
  }

  const epic = getTagValue(feature.featureTags, '@epic:') || 'untagged';
  const story = getTagValue(feature.featureTags, '@story:') || 'untagged';

  const totalScenarios = feature.scenarios.length;
  const e2eCount = feature.scenarios.filter((s) =>
    [...feature.featureTags, ...s.tags].some((t) => t === '@e2e')
  ).length;
  const futureCount = feature.scenarios.filter((s) =>
    [...feature.featureTags, ...s.tags].some((t) => t === '@future')
  ).length;
  const implementedCount = totalScenarios - futureCount;

  matrixRows.push({
    epic,
    story,
    featureName: feature.featureName,
    filePath: feature.filePath,
    totalScenarios,
    e2eCount,
    futureCount,
    implementedCount,
  });
}

// Sort by epic, then story
matrixRows.sort((a, b) => {
  if (a.epic !== b.epic) return a.epic.localeCompare(b.epic);
  return a.story.localeCompare(b.story);
});

// ---------------------------------------------------------------------------
// Output markdown
// ---------------------------------------------------------------------------

console.log('# BDD Coverage Matrix\n');
console.log(`Generated: ${new Date().toISOString()}\n`);

// Summary
const totalScenarios = matrixRows.reduce((sum, r) => sum + r.totalScenarios, 0);
const totalE2E = matrixRows.reduce((sum, r) => sum + r.e2eCount, 0);
const totalFuture = matrixRows.reduce((sum, r) => sum + r.futureCount, 0);
const totalImplemented = matrixRows.reduce((sum, r) => sum + r.implementedCount, 0);
const totalFeatures = matrixRows.length;
const epics = [...new Set(matrixRows.map((r) => r.epic))];

console.log('## Summary\n');
console.log(`| Metric | Count |`);
console.log(`|--------|-------|`);
console.log(`| Feature files | ${totalFeatures} |`);
console.log(`| Epics | ${epics.length} |`);
console.log(`| Total scenarios | ${totalScenarios} |`);
console.log(`| E2E scenarios | ${totalE2E} |`);
console.log(`| Implemented | ${totalImplemented} |`);
console.log(`| Future (not yet built) | ${totalFuture} |`);
console.log('');

// Detail table
console.log('## Coverage by Feature\n');
console.log(
  '| Epic | Story | Feature | Scenarios | E2E | Implemented | Future | File |'
);
console.log(
  '|------|-------|---------|-----------|-----|-------------|--------|------|'
);

for (const row of matrixRows) {
  console.log(
    `| ${row.epic} | ${row.story} | ${row.featureName} | ${row.totalScenarios} | ${row.e2eCount} | ${row.implementedCount} | ${row.futureCount} | \`${row.filePath}\` |`
  );
}

console.log('');

// Epic summary
console.log('## Coverage by Epic\n');
console.log('| Epic | Features | Scenarios | E2E | Implemented | Future |');
console.log('|------|----------|-----------|-----|-------------|--------|');

for (const epic of epics) {
  const epicRows = matrixRows.filter((r) => r.epic === epic);
  const epicScenarios = epicRows.reduce((s, r) => s + r.totalScenarios, 0);
  const epicE2E = epicRows.reduce((s, r) => s + r.e2eCount, 0);
  const epicImpl = epicRows.reduce((s, r) => s + r.implementedCount, 0);
  const epicFuture = epicRows.reduce((s, r) => s + r.futureCount, 0);
  console.log(
    `| ${epic} | ${epicRows.length} | ${epicScenarios} | ${epicE2E} | ${epicImpl} | ${epicFuture} |`
  );
}

console.log('');

// Tag index
console.log('## Tag Index\n');

const tagCounts = new Map();
for (const feature of parsed) {
  const allTags = new Set([...feature.featureTags]);
  for (const scenario of feature.scenarios) {
    for (const tag of scenario.tags) {
      allTags.add(tag);
    }
  }
  for (const tag of allTags) {
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
}

const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
console.log('| Tag | Feature Files |');
console.log('|-----|---------------|');
for (const [tag, count] of sortedTags) {
  console.log(`| \`${tag}\` | ${count} |`);
}
