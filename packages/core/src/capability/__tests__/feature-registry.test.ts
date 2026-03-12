/**
 * Tests for the OOXML Feature Coverage Registry.
 */

import { describe, expect, it } from 'vitest';
import {
  FEATURE_REGISTRY,
  getFeaturesByStatus,
  getCoverageSummary,
  findFeature,
  searchFeatures,
} from '../feature-registry.js';
import type { FeatureEntry, FeatureStatus } from '../feature-registry.js';

const VALID_STATUSES: FeatureStatus[] = ['full', 'partial', 'stub', 'not-implemented'];

describe('FEATURE_REGISTRY', () => {
  it('has entries', () => {
    expect(FEATURE_REGISTRY.length).toBeGreaterThan(0);
  });

  it('all entries have required fields', () => {
    for (const entry of FEATURE_REGISTRY) {
      expect(entry.xpath).toBeTruthy();
      expect(typeof entry.xpath).toBe('string');
      expect(VALID_STATUSES).toContain(entry.status);
      expect(entry.description).toBeTruthy();
      expect(typeof entry.description).toBe('string');
    }
  });

  it('has no duplicate xpaths', () => {
    const xpaths = FEATURE_REGISTRY.map((e) => e.xpath);
    const unique = new Set(xpaths);
    expect(unique.size).toBe(xpaths.length);
  });

  it('all status values are valid', () => {
    for (const entry of FEATURE_REGISTRY) {
      expect(VALID_STATUSES).toContain(entry.status);
    }
  });

  it('contains known core features', () => {
    const xpaths = new Set(FEATURE_REGISTRY.map((e) => e.xpath));
    expect(xpaths.has('a:xfrm')).toBe(true);
    expect(xpaths.has('a:solidFill')).toBe(true);
    expect(xpaths.has('a:ln')).toBe(true);
    expect(xpaths.has('a:txBody')).toBe(true);
    expect(xpaths.has('a:prstGeom')).toBe(true);
    expect(xpaths.has('p:pic')).toBe(true);
    expect(xpaths.has('a:tbl')).toBe(true);
    expect(xpaths.has('p:grpSp')).toBe(true);
    expect(xpaths.has('p:sld')).toBe(true);
    expect(xpaths.has('a:theme')).toBe(true);
  });

  it('parser field is a string when present', () => {
    for (const entry of FEATURE_REGISTRY) {
      if (entry.parser !== undefined) {
        expect(typeof entry.parser).toBe('string');
        expect(entry.parser.length).toBeGreaterThan(0);
      }
    }
  });

  it('renderer field is a string when present', () => {
    for (const entry of FEATURE_REGISTRY) {
      if (entry.renderer !== undefined) {
        expect(typeof entry.renderer).toBe('string');
        expect(entry.renderer.length).toBeGreaterThan(0);
      }
    }
  });

  it('notes field is a string when present', () => {
    for (const entry of FEATURE_REGISTRY) {
      if (entry.notes !== undefined) {
        expect(typeof entry.notes).toBe('string');
        expect(entry.notes.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('getCoverageSummary', () => {
  it('returns correct total', () => {
    const summary = getCoverageSummary();
    expect(summary.total).toBe(FEATURE_REGISTRY.length);
  });

  it('counts sum to total', () => {
    const summary = getCoverageSummary();
    expect(summary.full + summary.partial + summary.stub + summary.notImplemented).toBe(
      summary.total
    );
  });

  it('has at least some full entries', () => {
    const summary = getCoverageSummary();
    expect(summary.full).toBeGreaterThan(0);
  });

  it('has at least some not-implemented entries', () => {
    const summary = getCoverageSummary();
    expect(summary.notImplemented).toBeGreaterThan(0);
  });
});

describe('getFeaturesByStatus', () => {
  it('filters full features', () => {
    const full = getFeaturesByStatus('full');
    expect(full.length).toBeGreaterThan(0);
    for (const entry of full) {
      expect(entry.status).toBe('full');
    }
  });

  it('filters partial features', () => {
    const partial = getFeaturesByStatus('partial');
    expect(partial.length).toBeGreaterThan(0);
    for (const entry of partial) {
      expect(entry.status).toBe('partial');
    }
  });

  it('filters stub features', () => {
    const stubs = getFeaturesByStatus('stub');
    expect(stubs.length).toBeGreaterThan(0);
    for (const entry of stubs) {
      expect(entry.status).toBe('stub');
    }
  });

  it('filters not-implemented features', () => {
    const notImpl = getFeaturesByStatus('not-implemented');
    expect(notImpl.length).toBeGreaterThan(0);
    for (const entry of notImpl) {
      expect(entry.status).toBe('not-implemented');
    }
  });

  it('count matches summary', () => {
    const summary = getCoverageSummary();
    expect(getFeaturesByStatus('full').length).toBe(summary.full);
    expect(getFeaturesByStatus('partial').length).toBe(summary.partial);
    expect(getFeaturesByStatus('stub').length).toBe(summary.stub);
    expect(getFeaturesByStatus('not-implemented').length).toBe(summary.notImplemented);
  });
});

describe('findFeature', () => {
  it('finds known entry by exact xpath', () => {
    const entry = findFeature('a:xfrm');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('full');
    expect(entry!.description).toContain('position');
  });

  it('finds effect entry', () => {
    const entry = findFeature('a:effectLst/a:outerShdw');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('full');
  });

  it('returns undefined for unknown xpath', () => {
    const entry = findFeature('a:nonExistentElement');
    expect(entry).toBeUndefined();
  });

  it('finds not-implemented entry', () => {
    const entry = findFeature('p:transition');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('not-implemented');
  });
});

describe('searchFeatures', () => {
  it('searches by xpath substring', () => {
    const results = searchFeatures('effectLst');
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) {
      expect(entry.xpath).toContain('effectLst');
    }
  });

  it('searches by description substring', () => {
    const results = searchFeatures('shadow');
    expect(results.length).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    const upper = searchFeatures('SHADOW');
    const lower = searchFeatures('shadow');
    expect(upper.length).toBe(lower.length);
  });

  it('returns empty for no match', () => {
    const results = searchFeatures('zzz_nonexistent_zzz');
    expect(results).toHaveLength(0);
  });
});
