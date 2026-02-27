import { describe, it, expect } from 'vitest';
import { serializeContentTypes } from '../content-types-writer.js';
import type { ContentTypeEntry } from '../content-types-writer.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('serializeContentTypes', () => {
  it('serializes Default entries', () => {
    const entries: ContentTypeEntry[] = [
      { extension: 'xml', contentType: 'application/xml' },
      {
        extension: 'rels',
        contentType: 'application/vnd.openxmlformats-package.relationships+xml',
      },
    ];

    const xml = serializeContentTypes(entries);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    expect(xml).toContain('xmlns="http://schemas.openxmlformats.org/package/2006/content-types"');
    expect(xml).toContain('<Default Extension="xml" ContentType="application/xml"/>');
    expect(xml).toContain(
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    );
  });

  it('serializes Override entries', () => {
    const entries: ContentTypeEntry[] = [
      {
        partName: '/ppt/presentation.xml',
        contentType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
      },
      {
        partName: '/ppt/slides/slide1.xml',
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
      },
    ];

    const xml = serializeContentTypes(entries);

    expect(xml).toContain(
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
    );
    expect(xml).toContain(
      '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
    );
  });

  it('serializes mixed Default and Override entries', () => {
    const entries: ContentTypeEntry[] = [
      { extension: 'xml', contentType: 'application/xml' },
      {
        partName: '/ppt/presentation.xml',
        contentType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
      },
      { extension: 'png', contentType: 'image/png' },
      {
        partName: '/ppt/slides/slide1.xml',
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
      },
    ];

    const xml = serializeContentTypes(entries);

    expect(xml).toContain('<Default Extension="xml"');
    expect(xml).toContain('<Default Extension="png"');
    expect(xml).toContain('<Override PartName="/ppt/presentation.xml"');
    expect(xml).toContain('<Override PartName="/ppt/slides/slide1.xml"');
    // Verify proper structure
    expect(xml).toContain('<Types');
    expect(xml).toContain('</Types>');
  });

  it('produces valid XML for empty entries', () => {
    const xml = serializeContentTypes([]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    expect(xml).toContain('<Types');
    expect(xml).toContain('</Types>');
    expect(xml).not.toContain('<Default');
    expect(xml).not.toContain('<Override');
  });

  it('skips entries with neither extension nor partName', () => {
    const entries: ContentTypeEntry[] = [
      { contentType: 'application/xml' },
      { extension: 'xml', contentType: 'application/xml' },
    ];

    const xml = serializeContentTypes(entries);

    // Only one Default element should appear
    const defaultCount = (xml.match(/<Default /g) ?? []).length;
    expect(defaultCount).toBe(1);
  });

  it('escapes special XML characters in attribute values', () => {
    const entries: ContentTypeEntry[] = [
      { extension: 'xml', contentType: 'type&value' },
      { partName: '/part"name.xml', contentType: 'some<type>' },
    ];

    const xml = serializeContentTypes(entries);

    expect(xml).toContain('type&amp;value');
    expect(xml).toContain('/part&quot;name.xml');
    expect(xml).toContain('some&lt;type&gt;');
  });
});
