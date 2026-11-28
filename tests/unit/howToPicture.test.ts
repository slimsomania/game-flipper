import { describe, expect, it } from 'vitest';
import { HOW_TO_LAYOUT } from '../../src/game/view/howToLayout';
import { fillHeight, howToPictures } from '../../src/game/view/howToPicture';

describe('howToPictures', () => {
  const [low, high] = howToPictures();

  it('gives two bottles, little water then a lot, with bar fills in the same order', () => {
    expect(howToPictures()).toHaveLength(2);
    expect(low!.level).toBeLessThanOrEqual(0.3);
    expect(high!.level).toBeGreaterThanOrEqual(0.7);
    expect(high!.fill).toBeGreaterThan(low!.fill);
    expect(fillHeight(high!)).toBeGreaterThanOrEqual(2 * fillHeight(low!));
  });

  it('fills stay inside the bars', () => {
    for (const p of [low!, high!]) expect(p.fill).toBeGreaterThan(0);
    for (const p of [low!, high!]) expect(p.fill).toBeLessThanOrEqual(1);
  });

  it('keeps every box inside the picture strip, side by side and not overlapping', () => {
    const strip = HOW_TO_LAYOUT.pictures;
    const boxes = [low!.bottle, low!.bar, high!.bottle, high!.bar];
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(strip.left);
      expect(b.x + b.width).toBeLessThanOrEqual(strip.left + strip.width);
      expect(b.y).toBeGreaterThanOrEqual(strip.top);
      expect(b.y + b.height).toBeLessThanOrEqual(strip.top + strip.height);
    }
    for (let i = 0; i + 1 < boxes.length; i++) {
      expect(boxes[i]!.x + boxes[i]!.width).toBeLessThanOrEqual(boxes[i + 1]!.x);
    }
  });
});
