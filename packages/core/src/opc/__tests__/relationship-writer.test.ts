import { describe, it, expect } from 'vitest';
import { serializeRelationships } from '../relationship-writer.js';
import type { Relationship } from '../relationship-resolver.js';
import { REL_SLIDE, REL_THEME, REL_HYPERLINK } from '../relationship-resolver.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('serializeRelationships', () => {
  it('serializes internal relationships', () => {
    const rels: Relationship[] = [
      {
        id: 'rId1',
        type: REL_SLIDE,
        target: 'slides/slide1.xml',
      },
      {
        id: 'rId2',
        type: REL_THEME,
        target: 'theme/theme1.xml',
      },
    ];

    const xml = serializeRelationships(rels);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    expect(xml).toContain('xmlns="http://schemas.openxmlformats.org/package/2006/relationships"');
    expect(xml).toContain('Id="rId1"');
    expect(xml).toContain('Target="slides/slide1.xml"');
    expect(xml).toContain('Id="rId2"');
    expect(xml).toContain('Target="theme/theme1.xml"');
    // Internal relationships should NOT have TargetMode
    expect(xml).not.toContain('TargetMode');
  });

  it('serializes external relationships with TargetMode', () => {
    const rels: Relationship[] = [
      {
        id: 'rId1',
        type: REL_HYPERLINK,
        target: 'https://example.com',
        targetMode: 'External',
      },
    ];

    const xml = serializeRelationships(rels);

    expect(xml).toContain('Target="https://example.com"');
    expect(xml).toContain('TargetMode="External"');
  });

  it('handles mixed internal and external relationships', () => {
    const rels: Relationship[] = [
      {
        id: 'rId1',
        type: REL_SLIDE,
        target: 'slides/slide1.xml',
      },
      {
        id: 'rId2',
        type: REL_HYPERLINK,
        target: 'mailto:test@example.com',
        targetMode: 'External',
      },
    ];

    const xml = serializeRelationships(rels);

    // Only the external rel should have TargetMode
    const targetModeCount = (xml.match(/TargetMode="External"/g) ?? []).length;
    expect(targetModeCount).toBe(1);
    expect(xml).toContain('Target="slides/slide1.xml"');
    expect(xml).toContain('Target="mailto:test@example.com"');
  });

  it('produces valid XML for empty relationships', () => {
    const xml = serializeRelationships([]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    expect(xml).toContain('<Relationships');
    expect(xml).toContain('</Relationships>');
    expect(xml).not.toContain('<Relationship ');
  });

  it('does not emit TargetMode for Internal relationships', () => {
    const rels: Relationship[] = [
      {
        id: 'rId1',
        type: REL_SLIDE,
        target: 'slides/slide1.xml',
        targetMode: 'Internal',
      },
    ];

    const xml = serializeRelationships(rels);

    expect(xml).not.toContain('TargetMode');
  });

  it('escapes special XML characters in target URIs', () => {
    const rels: Relationship[] = [
      {
        id: 'rId1',
        type: REL_HYPERLINK,
        target: 'https://example.com?a=1&b=2',
        targetMode: 'External',
      },
    ];

    const xml = serializeRelationships(rels);

    expect(xml).toContain('https://example.com?a=1&amp;b=2');
  });
});
