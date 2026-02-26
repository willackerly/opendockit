/**
 * Tests for diagnostic emissions across renderer paths.
 *
 * Verifies that renderers emit structured diagnostics when features are
 * silently skipped or approximated, using the DiagnosticEmitter wired
 * through RenderContext.
 */

import { describe, it, expect } from 'vitest';
import { DiagnosticEmitter } from '../../../diagnostics/index.js';
import type { DiagnosticEvent } from '../../../diagnostics/index.js';
import type {
  EffectIR,
  InnerShadowIR,
  ReflectionIR,
  SoftEdgeIR,
  PatternFillIR,
  PictureFillIR,
  PictureIR,
  ConnectorIR,
  TransformIR,
} from '../../../ir/index.js';
import { applyEffects } from '../effect-renderer.js';
import { applyFill } from '../fill-renderer.js';
import { renderPicture } from '../picture-renderer.js';
import { renderConnector } from '../connector-renderer.js';
import { createMockContext, createMockRenderContext } from './mock-canvas.js';
import type { RenderContext } from '../render-context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOUNDS = { x: 0, y: 0, width: 100, height: 80 };
const EMU_PER_PX = 9525;

/** Create a RenderContext with a DiagnosticEmitter and collected events. */
function createDiagnosticRenderContext(): {
  rctx: RenderContext;
  events: DiagnosticEvent[];
} {
  const events: DiagnosticEvent[] = [];
  const emitter = new DiagnosticEmitter((e) => events.push(e));
  const ctx = createMockContext();
  const rctx: RenderContext = {
    ...createMockRenderContext(ctx),
    diagnostics: emitter,
    slideNumber: 1,
  };
  return { rctx, events };
}

function makeInnerShadow(): InnerShadowIR {
  return {
    type: 'innerShadow',
    blurRadius: 50800,
    distance: 38100,
    direction: 45,
    color: { r: 0, g: 0, b: 0, a: 0.5 },
  };
}

function makeReflection(): ReflectionIR {
  return {
    type: 'reflection',
    blurRadius: 0,
    startOpacity: 0.5,
    endOpacity: 0,
    distance: 0,
    direction: 90,
    fadeDirection: 90,
  };
}

function makeSoftEdge(): SoftEdgeIR {
  return {
    type: 'softEdge',
    radius: 50800,
  };
}

function makePicture(overrides?: { isVideoPlaceholder?: boolean }): PictureIR {
  const transform: TransformIR = {
    position: { x: 0, y: 0 },
    size: { width: 100 * EMU_PER_PX, height: 80 * EMU_PER_PX },
  };

  return {
    kind: 'picture',
    imagePartUri: '/ppt/media/image1.png',
    properties: {
      transform,
      effects: [],
    },
    nonVisualProperties: { name: 'Test Picture' },
    isVideoPlaceholder: overrides?.isVideoPlaceholder,
  };
}

function makeConnector(overrides?: {
  startConnection?: ConnectorIR['startConnection'];
  endConnection?: ConnectorIR['endConnection'];
}): ConnectorIR {
  return {
    kind: 'connector',
    properties: {
      transform: {
        position: { x: 0, y: 0 },
        size: { width: 100 * EMU_PER_PX, height: 50 * EMU_PER_PX },
      },
      effects: [],
      geometry: { kind: 'preset', name: 'straightConnector1' },
    },
    startConnection: overrides?.startConnection,
    endConnection: overrides?.endConnection,
  };
}

// ---------------------------------------------------------------------------
// Effect renderer diagnostics
// ---------------------------------------------------------------------------

describe('effect-renderer — diagnostic emissions', () => {
  it('emits partial-rendering for innerShadow', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const effects: EffectIR[] = [makeInnerShadow()];

    applyEffects(effects, rctx, BOUNDS);

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('partial-rendering');
    expect(events[0].severity).toBe('warning');
    expect(events[0].message).toContain('Inner shadow');
    expect(events[0].context?.slideNumber).toBe(1);
    expect(events[0].context?.elementType).toBe('effect');
  });

  it('emits partial-rendering for reflection', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const effects: EffectIR[] = [makeReflection()];

    applyEffects(effects, rctx, BOUNDS);

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('partial-rendering');
    expect(events[0].message).toContain('Reflection');
  });

  it('emits partial-rendering for softEdge', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const effects: EffectIR[] = [makeSoftEdge()];

    applyEffects(effects, rctx, BOUNDS);

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('partial-rendering');
    expect(events[0].message).toContain('Soft edge');
  });

  it('emits diagnostics for each unsupported effect in the list', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const effects: EffectIR[] = [makeInnerShadow(), makeReflection(), makeSoftEdge()];

    applyEffects(effects, rctx, BOUNDS);

    // All three unsupported effects should emit separate diagnostics.
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Inner shadow'),
        expect.stringContaining('Reflection'),
        expect.stringContaining('Soft edge'),
      ])
    );
  });

  it('does not emit diagnostics for supported effects (outerShadow)', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const effects: EffectIR[] = [
      {
        type: 'outerShadow',
        blurRadius: 50800,
        distance: 38100,
        direction: 45,
        color: { r: 0, g: 0, b: 0, a: 0.5 },
      },
    ];

    applyEffects(effects, rctx, BOUNDS);

    expect(events).toHaveLength(0);
  });

  it('does not emit diagnostics for glow', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const effects: EffectIR[] = [
      {
        type: 'glow',
        radius: 63500,
        color: { r: 255, g: 215, b: 0, a: 0.8 },
      },
    ];

    applyEffects(effects, rctx, BOUNDS);

    expect(events).toHaveLength(0);
  });

  it('does not emit diagnostics when no effects are present', () => {
    const { rctx, events } = createDiagnosticRenderContext();

    applyEffects([], rctx, BOUNDS);

    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fill renderer diagnostics
// ---------------------------------------------------------------------------

describe('fill-renderer — diagnostic emissions', () => {
  it('emits partial-rendering for pattern fill (solid approximation)', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const fill: PatternFillIR = {
      type: 'pattern',
      preset: 'dkHorz',
      foreground: { r: 100, g: 50, b: 25, a: 1 },
      background: { r: 255, g: 255, b: 255, a: 1 },
    };

    applyFill(fill, rctx, BOUNDS);

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('partial-rendering');
    expect(events[0].severity).toBe('info');
    expect(events[0].message).toContain('Pattern fill');
    expect(events[0].message).toContain('dkHorz');
    expect(events[0].context?.elementType).toBe('fill');
  });

  it('emits partial-rendering for picture fill (not implemented)', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const fill: PictureFillIR = {
      type: 'picture',
      imagePartUri: '/ppt/media/image1.png',
    };

    applyFill(fill, rctx, BOUNDS);

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('partial-rendering');
    expect(events[0].severity).toBe('warning');
    expect(events[0].message).toContain('Picture fill');
    expect(events[0].context?.elementType).toBe('fill');
  });

  it('does not emit diagnostics for solid fill', () => {
    const { rctx, events } = createDiagnosticRenderContext();

    applyFill({ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } }, rctx, BOUNDS);

    expect(events).toHaveLength(0);
  });

  it('does not emit diagnostics for gradient fill', () => {
    const { rctx, events } = createDiagnosticRenderContext();

    applyFill(
      {
        type: 'gradient',
        kind: 'linear',
        angle: 90,
        stops: [
          { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
        ],
      },
      rctx,
      BOUNDS
    );

    expect(events).toHaveLength(0);
  });

  it('does not emit diagnostics for no fill', () => {
    const { rctx, events } = createDiagnosticRenderContext();

    applyFill({ type: 'none' }, rctx, BOUNDS);

    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Picture renderer diagnostics
// ---------------------------------------------------------------------------

describe('picture-renderer — diagnostic emissions', () => {
  it('emits partial-rendering when video placeholder has no image', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const pic = makePicture({ isVideoPlaceholder: true });

    renderPicture(pic, rctx);

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('partial-rendering');
    expect(events[0].severity).toBe('info');
    expect(events[0].message).toContain('Video placeholder skipped');
    expect(events[0].message).toContain('no image');
    expect(events[0].context?.elementType).toBe('video');
    expect(events[0].context?.shapeName).toBe('Test Picture');
  });

  it('emits partial-rendering when video placeholder has degenerate poster', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    // Small image (240x240) — degenerate poster frame
    const mockImage = { width: 240, height: 240 } as unknown as ImageBitmap;
    rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

    const pic = makePicture({ isVideoPlaceholder: true });
    renderPicture(pic, rctx);

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('partial-rendering');
    expect(events[0].message).toContain('degenerate poster');
    expect(events[0].message).toContain('240x240');
    expect(events[0].context?.elementType).toBe('video');
  });

  it('does not emit diagnostics for normal picture rendering', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const mockImage = { width: 200, height: 150 } as unknown as ImageBitmap;
    rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

    const pic = makePicture();
    renderPicture(pic, rctx);

    expect(events).toHaveLength(0);
  });

  it('does not emit diagnostics for video placeholder with large poster', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const mockImage = { width: 1920, height: 1080 } as unknown as ImageBitmap;
    rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

    const pic = makePicture({ isVideoPlaceholder: true });
    renderPicture(pic, rctx);

    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Connector renderer diagnostics
// ---------------------------------------------------------------------------

describe('connector-renderer — diagnostic emissions', () => {
  it('emits partial-rendering for connector with no snapped endpoints', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const connector = makeConnector(); // no startConnection or endConnection

    renderConnector(connector, rctx);

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('partial-rendering');
    expect(events[0].severity).toBe('info');
    expect(events[0].message).toContain('no snapped endpoints');
    expect(events[0].context?.elementType).toBe('connector');
    expect(events[0].context?.slideNumber).toBe(1);
  });

  it('does not emit diagnostics when connector has start connection', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const connector = makeConnector({
      startConnection: { shapeId: '42', connectionSiteIndex: 0 },
    });

    renderConnector(connector, rctx);

    expect(events).toHaveLength(0);
  });

  it('does not emit diagnostics when connector has end connection', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const connector = makeConnector({
      endConnection: { shapeId: '42', connectionSiteIndex: 2 },
    });

    renderConnector(connector, rctx);

    expect(events).toHaveLength(0);
  });

  it('does not emit diagnostics when connector has both connections', () => {
    const { rctx, events } = createDiagnosticRenderContext();
    const connector = makeConnector({
      startConnection: { shapeId: '42', connectionSiteIndex: 0 },
      endConnection: { shapeId: '43', connectionSiteIndex: 2 },
    });

    renderConnector(connector, rctx);

    expect(events).toHaveLength(0);
  });
});
