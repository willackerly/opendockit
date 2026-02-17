import { describe, it, expect } from 'vitest';
import { parseXml } from '../../xml/index.js';
import {
  parseRelationships,
  REL_SLIDE,
  REL_SLIDE_LAYOUT,
  REL_THEME,
  REL_OFFICE_DOCUMENT,
  REL_HYPERLINK,
} from '../relationship-resolver.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Root relationships (/_rels/.rels) — points to presentation & docProps. */
const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="ppt/presentation.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"
    Target="docProps/core.xml"/>
</Relationships>`;

/** Presentation relationships — points to slides, theme, etc. */
const PRES_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
    Target="slides/slide1.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
    Target="slides/slide2.xml"/>
  <Relationship Id="rId3"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
    Target="theme/theme1.xml"/>
</Relationships>`;

/** Slide relationships — includes an external hyperlink. */
const SLIDE_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
    Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
    Target="https://example.com"
    TargetMode="External"/>
</Relationships>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseRelationships — root rels', () => {
  const xml = parseXml(ROOT_RELS_XML);
  const rels = parseRelationships(xml, '/');

  it('parses all relationships', () => {
    expect(rels.all()).toHaveLength(2);
  });

  it('resolves relative targets from root', () => {
    const rel = rels.getById('rId1');
    expect(rel).toBeDefined();
    expect(rel!.target).toBe('/ppt/presentation.xml');
    expect(rel!.type).toBe(REL_OFFICE_DOCUMENT);
  });

  it('resolves docProps target', () => {
    const rel = rels.getById('rId2');
    expect(rel).toBeDefined();
    expect(rel!.target).toBe('/docProps/core.xml');
  });

  it('getByType returns matching relationships', () => {
    const docs = rels.getByType(REL_OFFICE_DOCUMENT);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('rId1');
  });

  it('getByType returns empty array for missing type', () => {
    expect(rels.getByType(REL_SLIDE)).toEqual([]);
  });

  it('getById returns undefined for missing ID', () => {
    expect(rels.getById('rId99')).toBeUndefined();
  });
});

describe('parseRelationships — presentation rels', () => {
  const xml = parseXml(PRES_RELS_XML);
  const rels = parseRelationships(xml, '/ppt/presentation.xml');

  it('resolves slide targets relative to presentation', () => {
    const slide1 = rels.getById('rId1');
    expect(slide1).toBeDefined();
    expect(slide1!.target).toBe('/ppt/slides/slide1.xml');
  });

  it('resolves second slide target', () => {
    const slide2 = rels.getById('rId2');
    expect(slide2).toBeDefined();
    expect(slide2!.target).toBe('/ppt/slides/slide2.xml');
  });

  it('resolves theme target', () => {
    const theme = rels.getById('rId3');
    expect(theme).toBeDefined();
    expect(theme!.target).toBe('/ppt/theme/theme1.xml');
    expect(theme!.type).toBe(REL_THEME);
  });

  it('getByType returns all slides', () => {
    const slides = rels.getByType(REL_SLIDE);
    expect(slides).toHaveLength(2);
    expect(slides.map((r) => r.id)).toEqual(['rId1', 'rId2']);
  });
});

describe('parseRelationships — slide rels with external link', () => {
  const xml = parseXml(SLIDE_RELS_XML);
  const rels = parseRelationships(xml, '/ppt/slides/slide1.xml');

  it('resolves layout target with .. navigation', () => {
    const layout = rels.getById('rId1');
    expect(layout).toBeDefined();
    expect(layout!.target).toBe('/ppt/slideLayouts/slideLayout1.xml');
    expect(layout!.type).toBe(REL_SLIDE_LAYOUT);
  });

  it('preserves external hyperlink target as-is', () => {
    const link = rels.getById('rId2');
    expect(link).toBeDefined();
    expect(link!.target).toBe('https://example.com');
    expect(link!.targetMode).toBe('External');
    expect(link!.type).toBe(REL_HYPERLINK);
  });

  it('internal relationship has no explicit targetMode', () => {
    const layout = rels.getById('rId1');
    expect(layout!.targetMode).toBeUndefined();
  });
});
