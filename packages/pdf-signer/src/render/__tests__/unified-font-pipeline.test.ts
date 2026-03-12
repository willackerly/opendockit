import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FontRegistrar, type ExternalFontResolver } from '../font-registrar.js';

describe('FontRegistrar — external resolver bridge', () => {
  let registrar: FontRegistrar;
  let mockResolver: ExternalFontResolver;
  let registeredFonts: Array<{
    family: string;
    data: ArrayBuffer | Uint8Array;
    weight?: number;
    style?: 'normal' | 'italic';
  }>;

  beforeEach(() => {
    registrar = new FontRegistrar();
    registeredFonts = [];
    mockResolver = {
      registerExtractedFont: vi.fn(async (family, data, weight, style) => {
        registeredFonts.push({ family, data, weight, style });
        return true;
      }),
    };
  });

  afterEach(async () => {
    await registrar.cleanup();
  });

  it('feeds extracted fonts to external resolver when set', async () => {
    registrar.setExternalResolver(mockResolver);

    const fontBytes = await loadRealFont();
    if (!fontBytes) return; // skip if no system font available

    const family = await registrar.register('TestFont', fontBytes);

    expect(family).toBeDefined();
    expect(mockResolver.registerExtractedFont).toHaveBeenCalledTimes(1);
    expect(registeredFonts[0].family).toBe(family);
  });

  it('does not call resolver when none is set', async () => {
    const fontBytes = await loadRealFont();
    if (!fontBytes) return;

    await registrar.register('TestFont', fontBytes);

    expect(mockResolver.registerExtractedFont).not.toHaveBeenCalled();
  });

  it('survives resolver failure gracefully', async () => {
    const failingResolver: ExternalFontResolver = {
      registerExtractedFont: vi.fn(async () => {
        throw new Error('Resolver explosion');
      }),
    };
    registrar.setExternalResolver(failingResolver);

    const fontBytes = await loadRealFont();
    if (!fontBytes) return;

    // Should not throw — resolver failure is non-fatal
    const family = await registrar.register('TestFont', fontBytes);
    expect(family).toBeDefined();
    expect(registrar.has('TestFont')).toBe(true);
  });

  it('passes weight and style to resolver', async () => {
    registrar.setExternalResolver(mockResolver);

    const fontBytes = await loadRealFont();
    if (!fontBytes) return;

    await registrar.register('BoldFont', fontBytes, {
      weight: 'bold',
      style: 'italic',
    });

    expect(registeredFonts[0].weight).toBe(700);
    expect(registeredFonts[0].style).toBe('italic');
  });

  it('passes default weight/style when not specified', async () => {
    registrar.setExternalResolver(mockResolver);

    const fontBytes = await loadRealFont();
    if (!fontBytes) return;

    await registrar.register('NormalFont', fontBytes);

    expect(registeredFonts[0].weight).toBe(400);
    expect(registeredFonts[0].style).toBe('normal');
  });

  it('can be cleared by setting resolver to null', async () => {
    registrar.setExternalResolver(mockResolver);
    registrar.setExternalResolver(null);

    const fontBytes = await loadRealFont();
    if (!fontBytes) return;

    await registrar.register('TestFont', fontBytes);

    expect(mockResolver.registerExtractedFont).not.toHaveBeenCalled();
  });

  it('bridges multiple font registrations', async () => {
    registrar.setExternalResolver(mockResolver);

    const fontBytes = await loadRealFont();
    if (!fontBytes) return;

    const fonts = ['FontA', 'FontB', 'FontC'];
    for (const name of fonts) {
      await registrar.register(name, new Uint8Array(fontBytes));
    }

    expect(mockResolver.registerExtractedFont).toHaveBeenCalledTimes(3);
    expect(registeredFonts).toHaveLength(3);
  });
});

describe('ExternalFontResolver interface', () => {
  it('matches the shape expected by FontRegistrar', () => {
    // Type-level test: verify ExternalFontResolver is structurally compatible
    const resolver: ExternalFontResolver = {
      registerExtractedFont: async () => true,
    };
    expect(resolver).toBeDefined();
    expect(typeof resolver.registerExtractedFont).toBe('function');
  });
});

/**
 * Try to load a real font file from the system.
 * Returns null if no font is available (CI may not have fonts).
 */
async function loadRealFont(): Promise<Uint8Array | null> {
  const fs = await import('fs');
  const testFontPaths = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];

  for (const p of testFontPaths) {
    try {
      return new Uint8Array(fs.readFileSync(p));
    } catch {
      continue;
    }
  }
  return null;
}
