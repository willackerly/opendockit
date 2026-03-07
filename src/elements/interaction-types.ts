/**
 * Types for the interactive canvas state machine.
 *
 * Pure type definitions — no runtime code.
 */

import type { PageElement } from './types.js';
import type { Rect } from './spatial.js';

// ─── Viewport ────────────────────────────────────────────

export interface Viewport {
  scale: number;        // e.g. 1.5
  pageWidth: number;    // PDF points (from MediaBox)
  pageHeight: number;   // PDF points
}

// ─── Input modifiers ─────────────────────────────────────

export interface Modifiers {
  shift: boolean;
  ctrl: boolean;        // meta on macOS
  alt: boolean;
}

// ─── FSM modes ───────────────────────────────────────────

export type InteractionMode = 'idle' | 'selecting' | 'marquee' | 'drawing-rect';

// ─── Snapshot (for useSyncExternalStore) ─────────────────

export interface InteractionSnapshot {
  readonly mode: InteractionMode;
  readonly selectedIds: ReadonlySet<string>;
  readonly hoveredId: string | null;
  readonly selectionRect: Rect | null;  // active marquee/drawing rect in PAGE coords
  readonly viewport: Viewport;
  readonly elements: readonly PageElement[];
}

// ─── Events ──────────────────────────────────────────────

export type InteractionEvent =
  | { type: 'selectionChanged'; selectedIds: ReadonlySet<string> }
  | { type: 'hoverChanged'; hoveredId: string | null; previousId: string | null }
  | { type: 'rectDrawn'; rect: Rect }
  | { type: 'stateChanged' };

// ─── Listener types ──────────────────────────────────────

export type StateListener = () => void;
export type EventListener = (event: InteractionEvent) => void;
