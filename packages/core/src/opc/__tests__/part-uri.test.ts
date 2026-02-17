import { describe, it, expect } from 'vitest';
import {
  normalizePartUri,
  resolvePartUri,
  getPartDirectory,
  getRelationshipPartUri,
  getRootRelationshipUri,
} from '../part-uri.js';

// ---------------------------------------------------------------------------
// normalizePartUri
// ---------------------------------------------------------------------------

describe('normalizePartUri', () => {
  it('adds leading slash when missing', () => {
    expect(normalizePartUri('ppt/presentation.xml')).toBe('/ppt/presentation.xml');
  });

  it('preserves existing leading slash', () => {
    expect(normalizePartUri('/ppt/presentation.xml')).toBe('/ppt/presentation.xml');
  });

  it('collapses double slashes', () => {
    expect(normalizePartUri('/ppt//slides//slide1.xml')).toBe('/ppt/slides/slide1.xml');
  });

  it('collapses triple slashes', () => {
    expect(normalizePartUri('/ppt///slides/slide1.xml')).toBe('/ppt/slides/slide1.xml');
  });

  it('resolves single dot segments', () => {
    expect(normalizePartUri('/ppt/./slides/slide1.xml')).toBe('/ppt/slides/slide1.xml');
  });

  it('resolves double dot segments', () => {
    expect(normalizePartUri('/ppt/slides/../theme/theme1.xml')).toBe('/ppt/theme/theme1.xml');
  });

  it('resolves multiple double dot segments', () => {
    expect(normalizePartUri('/ppt/slides/../../docProps/core.xml')).toBe('/docProps/core.xml');
  });

  it('does not go above root with excessive ..', () => {
    expect(normalizePartUri('/ppt/../../../file.xml')).toBe('/file.xml');
  });

  it('handles bare filename (JSZip root-level file)', () => {
    expect(normalizePartUri('[Content_Types].xml')).toBe('/[Content_Types].xml');
  });

  it('handles root-only path', () => {
    expect(normalizePartUri('/')).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// resolvePartUri
// ---------------------------------------------------------------------------

describe('resolvePartUri', () => {
  it('resolves a sibling target', () => {
    expect(resolvePartUri('/ppt/slides/slide1.xml', 'slide2.xml')).toBe('/ppt/slides/slide2.xml');
  });

  it('resolves a relative target with ..', () => {
    expect(resolvePartUri('/ppt/slides/slide1.xml', '../theme/theme1.xml')).toBe(
      '/ppt/theme/theme1.xml'
    );
  });

  it('resolves an absolute target', () => {
    expect(resolvePartUri('/ppt/slides/slide1.xml', '/docProps/core.xml')).toBe(
      '/docProps/core.xml'
    );
  });

  it('resolves a target from root relationships source', () => {
    expect(resolvePartUri('/', 'ppt/presentation.xml')).toBe('/ppt/presentation.xml');
  });

  it('resolves a deeper relative target', () => {
    expect(resolvePartUri('/ppt/presentation.xml', 'slides/slide1.xml')).toBe(
      '/ppt/slides/slide1.xml'
    );
  });
});

// ---------------------------------------------------------------------------
// getPartDirectory
// ---------------------------------------------------------------------------

describe('getPartDirectory', () => {
  it('returns directory for a part in a subdirectory', () => {
    expect(getPartDirectory('/ppt/slides/slide1.xml')).toBe('/ppt/slides');
  });

  it('returns directory for a top-level part', () => {
    expect(getPartDirectory('/ppt/presentation.xml')).toBe('/ppt');
  });

  it('returns root for a root-level file', () => {
    expect(getPartDirectory('/[Content_Types].xml')).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// getRelationshipPartUri
// ---------------------------------------------------------------------------

describe('getRelationshipPartUri', () => {
  it('returns correct rels path for a slide', () => {
    expect(getRelationshipPartUri('/ppt/slides/slide1.xml')).toBe(
      '/ppt/slides/_rels/slide1.xml.rels'
    );
  });

  it('returns correct rels path for presentation.xml', () => {
    expect(getRelationshipPartUri('/ppt/presentation.xml')).toBe(
      '/ppt/_rels/presentation.xml.rels'
    );
  });

  it('returns correct rels path for a theme', () => {
    expect(getRelationshipPartUri('/ppt/theme/theme1.xml')).toBe(
      '/ppt/theme/_rels/theme1.xml.rels'
    );
  });
});

// ---------------------------------------------------------------------------
// getRootRelationshipUri
// ---------------------------------------------------------------------------

describe('getRootRelationshipUri', () => {
  it('returns /_rels/.rels', () => {
    expect(getRootRelationshipUri()).toBe('/_rels/.rels');
  });
});
