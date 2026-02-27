import { describe, it, expect } from 'vitest';
import { EditableSlideKit } from '../editable-slide-kit.js';

describe('EditableSlideKit', () => {
  it('throws when accessing presentation before load', () => {
    const kit = new EditableSlideKit();
    expect(() => kit.presentation).toThrow('No presentation loaded');
  });

  it('throws when saving before load', async () => {
    const kit = new EditableSlideKit();
    await expect(kit.save()).rejects.toThrow('No presentation loaded');
  });

  it('returns 0 for slide dimensions before load', () => {
    const kit = new EditableSlideKit();
    expect(kit.slideWidth).toBe(0);
    expect(kit.slideHeight).toBe(0);
  });
});
