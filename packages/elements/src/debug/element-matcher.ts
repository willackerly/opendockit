/**
 * Element Matcher — matches elements from two sources by text content
 * similarity and spatial proximity.
 *
 * Typical use: comparing PPTX trace-converted elements against
 * PDF-extracted elements to verify rendering fidelity.
 */

import type { PageElement, TextElement } from '../types.js';

// ─── Public Types ──────────────────────────────────────

/** A matched pair of elements from source A and source B. */
export interface MatchedPair {
  a: PageElement;
  b: PageElement;
  /** Confidence score from 0 (lowest) to 1 (highest). */
  confidence: number;
  matchMethod: 'text-exact' | 'text-fuzzy' | 'spatial';
}

/** Result of matching two element lists. */
export interface MatchResult {
  matched: MatchedPair[];
  unmatchedA: PageElement[];
  unmatchedB: PageElement[];
}

// ─── Constants ─────────────────────────────────────────

/** Minimum similarity ratio for fuzzy text matching. */
const FUZZY_SIMILARITY_THRESHOLD = 0.7;

/** Maximum centroid distance (in points) for fuzzy text matching. */
const FUZZY_DISTANCE_THRESHOLD = 50;

/** Minimum IoU for spatial (non-text) matching. */
const SPATIAL_IOU_THRESHOLD = 0.3;

// ─── Helpers ───────────────────────────────────────────

/**
 * Extract flat text from a PageElement. For TextElements, concatenates all
 * runs across all paragraphs. Returns empty string for non-text elements.
 */
export function extractText(element: PageElement): string {
  if (element.type !== 'text') return '';
  const te = element as TextElement;
  return te.paragraphs
    .map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n');
}

/**
 * Compute Euclidean distance between the centroids of two elements.
 */
export function centroidDistance(a: PageElement, b: PageElement): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/**
 * Compute Intersection over Union (IoU) of two axis-aligned bounding boxes.
 * Returns 0 if there is no overlap, 1 for identical boxes.
 */
export function computeIoU(a: PageElement, b: PageElement): number {
  const ax1 = a.x;
  const ay1 = a.y;
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;

  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;

  if (intersection === 0) return 0;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute the length of the longest common substring between two strings.
 * Uses a classic DP approach with O(m*n) time and O(n) space.
 */
export function longestCommonSubstring(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;

  let maxLen = 0;
  // Use a single row — only need previous and current values
  let prev = new Array<number>(b.length + 1).fill(0);
  let curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > maxLen) maxLen = curr[j];
      } else {
        curr[j] = 0;
      }
    }
    // Swap rows
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return maxLen;
}

// ─── Internal ──────────────────────────────────────────

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─── Main API ──────────────────────────────────────────

/**
 * Match elements from two sources using text content similarity and
 * spatial proximity.
 *
 * Algorithm:
 * 1. Text-exact match — identical normalized text, tie-break by centroid distance.
 * 2. Text-fuzzy match — LCS similarity > 0.7 and centroid distance < 50pt.
 * 3. Spatial match — IoU > 0.3 for non-text elements.
 *
 * @param sourceA - Elements from the first source (e.g. PPTX trace).
 * @param sourceB - Elements from the second source (e.g. PDF extraction).
 * @returns Matched pairs and unmatched remainders from both sources.
 */
export function matchElements(
  sourceA: PageElement[],
  sourceB: PageElement[],
): MatchResult {
  const matched: MatchedPair[] = [];
  const usedA = new Set<string>();
  const usedB = new Set<string>();

  // ── Pass 1: Text-exact match ─────────────────────────

  const textA = sourceA.filter((e) => e.type === 'text') as TextElement[];
  const textB = sourceB.filter((e) => e.type === 'text') as TextElement[];

  for (const a of textA) {
    if (usedA.has(a.id)) continue;

    const normA = normalizeText(extractText(a));
    if (normA.length === 0) continue;

    let bestB: TextElement | null = null;
    let bestDist = Infinity;

    for (const b of textB) {
      if (usedB.has(b.id)) continue;
      const normB = normalizeText(extractText(b));
      if (normA === normB) {
        const dist = centroidDistance(a, b);
        if (dist < bestDist) {
          bestDist = dist;
          bestB = b;
        }
      }
    }

    if (bestB) {
      matched.push({
        a,
        b: bestB,
        confidence: 1.0,
        matchMethod: 'text-exact',
      });
      usedA.add(a.id);
      usedB.add(bestB.id);
    }
  }

  // ── Pass 2: Text-fuzzy match ─────────────────────────

  for (const a of textA) {
    if (usedA.has(a.id)) continue;

    const normA = normalizeText(extractText(a));
    if (normA.length === 0) continue;

    let bestB: TextElement | null = null;
    let bestSimilarity = 0;
    let bestDist = Infinity;

    for (const b of textB) {
      if (usedB.has(b.id)) continue;

      const normB = normalizeText(extractText(b));
      if (normB.length === 0) continue;

      const lcs = longestCommonSubstring(normA, normB);
      const maxLen = Math.max(normA.length, normB.length);
      const similarity = maxLen === 0 ? 0 : lcs / maxLen;

      if (similarity <= FUZZY_SIMILARITY_THRESHOLD) continue;

      const dist = centroidDistance(a, b);
      if (dist >= FUZZY_DISTANCE_THRESHOLD) continue;

      // Pick highest similarity, then smallest distance
      if (
        similarity > bestSimilarity ||
        (similarity === bestSimilarity && dist < bestDist)
      ) {
        bestSimilarity = similarity;
        bestDist = dist;
        bestB = b;
      }
    }

    if (bestB) {
      matched.push({
        a,
        b: bestB,
        confidence: bestSimilarity,
        matchMethod: 'text-fuzzy',
      });
      usedA.add(a.id);
      usedB.add(bestB.id);
    }
  }

  // ── Pass 3: Spatial match for non-text elements ──────

  const nonTextA = sourceA.filter((e) => e.type !== 'text');
  const nonTextB = sourceB.filter((e) => e.type !== 'text');

  for (const a of nonTextA) {
    if (usedA.has(a.id)) continue;

    let bestB: PageElement | null = null;
    let bestIoU = 0;

    for (const b of nonTextB) {
      if (usedB.has(b.id)) continue;
      if (a.type !== b.type) continue;

      const iou = computeIoU(a, b);
      if (iou > SPATIAL_IOU_THRESHOLD && iou > bestIoU) {
        bestIoU = iou;
        bestB = b;
      }
    }

    if (bestB) {
      matched.push({
        a,
        b: bestB,
        confidence: bestIoU,
        matchMethod: 'spatial',
      });
      usedA.add(a.id);
      usedB.add(bestB.id);
    }
  }

  // ── Collect unmatched ────────────────────────────────

  const unmatchedA = sourceA.filter((e) => !usedA.has(e.id));
  const unmatchedB = sourceB.filter((e) => !usedB.has(e.id));

  return { matched, unmatchedA, unmatchedB };
}
