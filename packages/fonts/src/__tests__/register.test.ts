import { describe, it, expect } from 'vitest';
import { registerOfflineFonts } from '../index.js';

describe('registerOfflineFonts()', () => {
  it('is a no-op with empty manifest (no families)', async () => {
    // Manifest has no families, so nothing to register
    await expect(registerOfflineFonts()).resolves.toBeUndefined();
  });

  it('is a no-op with specific families that do not exist', async () => {
    await expect(
      registerOfflineFonts(['NonExistentFont']),
    ).resolves.toBeUndefined();
  });

  it('handles missing FontFace gracefully (Node.js env)', async () => {
    // In Node.js, FontFace is undefined — should return immediately
    expect(typeof FontFace).toBe('undefined');
    await expect(registerOfflineFonts()).resolves.toBeUndefined();
  });
});
