import { describe, it, expect } from 'vitest';
import {
  extractGroundTruth,
  extractAllPages,
  GroundTruthPage,
} from './ground-truth-extractor';

const TEST_PDF =
  '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pdf';

describe('ground-truth-extractor', () => {
  describe('extractGroundTruth (single page)', () => {
    it('extracts valid page dimensions for page 1', async () => {
      const page = await extractGroundTruth(TEST_PDF, 1);

      // USG Briefing is a 10x5.625" slide deck (720x405 points)
      expect(page.width).toBeCloseTo(720, 0);
      expect(page.height).toBeCloseTo(405, 0);
      expect(page.pageNum).toBe(1);
    });

    it('extracts words with bounding boxes', async () => {
      const page = await extractGroundTruth(TEST_PDF, 1);

      expect(page.words.length).toBeGreaterThan(0);

      // Every word should have valid dimensions
      for (const word of page.words) {
        expect(word.text.length).toBeGreaterThan(0);
        expect(word.x).toBeGreaterThanOrEqual(0);
        expect(word.y).toBeGreaterThanOrEqual(0);
        expect(word.width).toBeGreaterThan(0);
        expect(word.height).toBeGreaterThan(0);
      }
    });

    it('finds expected words on page 1', async () => {
      const page = await extractGroundTruth(TEST_PDF, 1);
      const texts = page.words.map((w) => w.text);

      // Known content from the title slide
      expect(texts).toContain('UNCLASSIFIED');
      expect(texts).toContain('Virtru');
      expect(texts).toContain('Data');
      expect(texts).toContain('Security');
    });

    it('groups words into lines', async () => {
      const page = await extractGroundTruth(TEST_PDF, 1);

      expect(page.lines.length).toBeGreaterThan(0);

      for (const line of page.lines) {
        expect(line.words.length).toBeGreaterThan(0);
        expect(line.width).toBeGreaterThan(0);
        expect(line.height).toBeGreaterThan(0);
      }

      // The "Virtru Data Centric Security" line should have 4 words
      const titleLine = page.lines.find((l) =>
        l.words.some((w) => w.text === 'Virtru')
      );
      expect(titleLine).toBeDefined();
      expect(titleLine!.words.map((w) => w.text)).toEqual([
        'Virtru',
        'Data',
        'Centric',
        'Security',
      ]);
    });

    it('groups lines into blocks', async () => {
      const page = await extractGroundTruth(TEST_PDF, 1);

      expect(page.blocks.length).toBeGreaterThan(0);

      for (const block of page.blocks) {
        expect(block.lines.length).toBeGreaterThan(0);
        expect(block.width).toBeGreaterThan(0);
        expect(block.height).toBeGreaterThan(0);
      }
    });

    it('word coordinates are within page bounds', async () => {
      const page = await extractGroundTruth(TEST_PDF, 1);

      for (const word of page.words) {
        expect(word.x).toBeLessThanOrEqual(page.width + 1);
        expect(word.y).toBeLessThanOrEqual(page.height + 1);
        expect(word.x + word.width).toBeLessThanOrEqual(page.width + 1);
        expect(word.y + word.height).toBeLessThanOrEqual(page.height + 1);
      }
    });

    it('decodes HTML entities in word text', async () => {
      const page = await extractGroundTruth(TEST_PDF, 1);
      const texts = page.words.map((w) => w.text);

      // The copyright line has "&" which comes as &amp; in XML
      expect(texts).toContain('&');
    });
  });

  describe('extractAllPages', () => {
    it('extracts all 30 pages', async () => {
      const pages = await extractAllPages(TEST_PDF);

      expect(pages.length).toBe(30);

      // All pages should have the same dimensions (consistent slide deck)
      for (const page of pages) {
        expect(page.width).toBeCloseTo(720, 0);
        expect(page.height).toBeCloseTo(405, 0);
      }

      // Page numbers should be sequential
      expect(pages.map((p) => p.pageNum)).toEqual(
        Array.from({ length: 30 }, (_, i) => i + 1)
      );
    });

    it('every page has at least some text content', async () => {
      const pages = await extractAllPages(TEST_PDF);

      for (const page of pages) {
        expect(page.words.length).toBeGreaterThan(0);
      }
    });
  });

  describe('extractGroundTruth (other pages)', () => {
    it('extracts page 2 with different content', async () => {
      const page = await extractGroundTruth(TEST_PDF, 2);

      expect(page.pageNum).toBe(2);
      expect(page.words.length).toBeGreaterThan(0);

      // Page 2 should have different content than page 1
      const texts = page.words.map((w) => w.text);
      // UNCLASSIFIED appears on every page as header/footer
      expect(texts).toContain('UNCLASSIFIED');
    });
  });
});
