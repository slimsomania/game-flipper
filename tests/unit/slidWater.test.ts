import { describe, expect, it } from 'vitest';
import {
  BOTTLE_BODY_HEIGHT,
  BOTTLE_BODY_WIDTH,
  BOTTLE_WALL,
  slidWaterVertices,
  waterVertices,
} from '../../src/core/bottleShape';
import { sloshLimit } from '../../src/core/slosh';

describe('slidWaterVertices', () => {
  it('equals the plain fill at offset 0', () => {
    for (let level = 0; level <= 1.0001; level += 0.05) {
      expect(slidWaterVertices(level, 0)).toEqual(waterVertices(level));
    }
  });

  it('stays inside the body outline for every level and offset up to (and past) the limit', () => {
    const half = BOTTLE_BODY_WIDTH / 2;
    for (let level = 0; level <= 1.0001; level += 0.01) {
      const limit = sloshLimit(level);
      for (const offset of [-1, 0, limit / 3, limit / 2, limit, limit + 0.1, 5, Number.NaN]) {
        const v = slidWaterVertices(level, offset);
        if (!v) continue;
        for (const p of v) {
          expect(Math.abs(p.x)).toBeLessThanOrEqual(half + 1e-9);
          expect(p.y).toBeLessThanOrEqual(1e-9);
          expect(p.y).toBeGreaterThanOrEqual(-BOTTLE_BODY_HEIGHT - 1e-9);
        }
      }
    }
  });

  it('shifts the fill toward the cap (negative y) and keeps its height', () => {
    const base = slidWaterVertices(0.3, 0)!;
    const moved = slidWaterVertices(0.3, 0.05)!;
    for (let i = 0; i < base.length; i++) {
      expect(moved[i].y).toBeCloseTo(base[i].y - 0.05, 9);
      expect(moved[i].x).toBe(base[i].x);
    }
    expect(BOTTLE_WALL).toBeGreaterThan(0);
  });

  it('is null when empty', () => {
    expect(slidWaterVertices(0, 0.1)).toBeNull();
  });
});
