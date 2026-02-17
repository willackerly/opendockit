import { describe, it, expect } from 'vitest';
import { parseXml } from '../../xml/index.js';
import { parseContentTypes } from '../content-types.js';

// ---------------------------------------------------------------------------
// Test fixture — realistic [Content_Types].xml
// ---------------------------------------------------------------------------

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml"
            ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseContentTypes', () => {
  const xml = parseXml(CONTENT_TYPES_XML);
  const ct = parseContentTypes(xml);

  describe('getType — Override precedence', () => {
    it('returns Override content type for a known part', () => {
      expect(ct.getType('/ppt/presentation.xml')).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'
      );
    });

    it('returns Override content type for slides', () => {
      expect(ct.getType('/ppt/slides/slide1.xml')).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
      );
    });

    it('returns Override content type for theme', () => {
      expect(ct.getType('/ppt/theme/theme1.xml')).toBe(
        'application/vnd.openxmlformats-officedocument.theme+xml'
      );
    });
  });

  describe('getType — Default fallback', () => {
    it('falls back to Default for an unknown XML file', () => {
      expect(ct.getType('/ppt/unknown/something.xml')).toBe('application/xml');
    });

    it('returns Default content type for PNG images', () => {
      expect(ct.getType('/ppt/media/image1.png')).toBe('image/png');
    });

    it('returns Default content type for JPEG images', () => {
      expect(ct.getType('/ppt/media/photo.jpeg')).toBe('image/jpeg');
    });

    it('returns Default content type for rels files', () => {
      expect(ct.getType('/_rels/.rels')).toBe(
        'application/vnd.openxmlformats-package.relationships+xml'
      );
    });
  });

  describe('getType — case insensitivity for extensions', () => {
    it('matches extensions case-insensitively', () => {
      expect(ct.getType('/ppt/media/image.PNG')).toBe('image/png');
    });
  });

  describe('getType — undefined for unknown extensions', () => {
    it('returns undefined for files with no matching Default or Override', () => {
      expect(ct.getType('/ppt/media/video.mp4')).toBeUndefined();
    });

    it('returns undefined for files with no extension', () => {
      expect(ct.getType('/noextension')).toBeUndefined();
    });
  });

  describe('getPartsByType', () => {
    it('returns all slide parts', () => {
      const slides = ct.getPartsByType(
        'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
      );
      expect(slides).toHaveLength(2);
      expect(slides).toContain('/ppt/slides/slide1.xml');
      expect(slides).toContain('/ppt/slides/slide2.xml');
    });

    it('returns single-entry types', () => {
      const themes = ct.getPartsByType('application/vnd.openxmlformats-officedocument.theme+xml');
      expect(themes).toEqual(['/ppt/theme/theme1.xml']);
    });

    it('returns empty array for unknown content types', () => {
      expect(ct.getPartsByType('application/nonexistent')).toEqual([]);
    });
  });
});
