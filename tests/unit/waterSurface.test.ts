import { describe, expect, it } from 'vitest';
import { waterRect, type Point } from '../../src/core/bottleShape';
import { WaterMotion, waterShape } from '../../src/game/view/waterSurface';

const area = (polygon: readonly Point[]): number => {
  let twice = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
};

const upright = (level: number): number => {
  const r = waterRect(level)!;
  return (r.x1 - r.x0) * (r.y1 - r.y0);
};

describe('waterShape', () => {
  it('keeps the upright volume at every tilt and level', () => {
    for (const level of [0.1, 0.3, 0.5, 0.9, 1]) {
      for (let deg = 0; deg < 360; deg += 15) {
        const a = (deg * Math.PI) / 180;
        const shape = waterShape(level, { x: Math.sin(a), y: Math.cos(a) })!;
        expect(area(shape.polygon)).toBeCloseTo(upright(level), 5);
      }
    }
  });

  it('is the flat fill at the base when upright', () => {
    const shape = waterShape(0.4, { x: 0, y: 1 })!;
    const r = waterRect(0.4)!;
    expect(Math.min(...shape.polygon.map((p) => p.y))).toBeCloseTo(r.y0, 6);
    expect(Math.max(...shape.polygon.map((p) => p.y))).toBeCloseTo(r.y1, 6);
    expect(shape.surface![0].y).toBeCloseTo(r.y0, 6);
    expect(shape.surface![1].y).toBeCloseTo(r.y0, 6);
  });

  it('spreads along the lower wall when the bottle lies on its side', () => {
    // Down is the bottle's +x side: the water is a layer against that wall, over the full length.
    const shape = waterShape(0.5, { x: 1, y: 0 })!;
    const xs = shape.polygon.map((p) => p.x);
    const ys = shape.polygon.map((p) => p.y);
    const r = waterRect(1)!;
    expect(Math.max(...xs)).toBeCloseTo(r.x1, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.8 * (r.y1 - r.y0));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.6 * (r.x1 - r.x0));
  });

  it('has no surface when full and no shape when empty', () => {
    expect(waterShape(1, { x: 0, y: 1 })!.surface).toBeNull();
    expect(waterShape(0, { x: 0, y: 1 })).toBeNull();
  });
});

describe('WaterMotion', () => {
  const frame = 1 / 60;

  it('settles level for a bottle at rest', () => {
    const motion = new WaterMotion();
    for (let i = 0; i < 120; i++) motion.step(frame, 5, 5);
    expect(motion.down(0).x).toBeCloseTo(0, 6);
    expect(motion.down(0).y).toBeCloseTo(1, 6);
    // Turned a quarter turn clockwise, the bottle sees the world's down along its own +x.
    const d = motion.down(Math.PI / 2);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
    expect(d.x).toBeCloseTo(1, 6);
  });

  it('tilts when the bottle stops suddenly, then settles again', () => {
    const motion = new WaterMotion();
    let x = 0;
    for (let i = 0; i < 30; i++) {
      x += 6 * frame; // moving right at 6 m/s
      motion.step(frame, x, 5);
    }
    let maxTilt = 0;
    for (let i = 0; i < 20; i++) {
      motion.step(frame, x, 5); // hits a wall: stops dead
      maxTilt = Math.max(maxTilt, Math.abs(motion.down(0).x));
    }
    expect(maxTilt).toBeGreaterThan(0.05);
    for (let i = 0; i < 300; i++) motion.step(frame, x, 5);
    expect(Math.abs(motion.down(0).x)).toBeLessThan(0.01);
  });

  it('starts over after a jump of the pose (a new bottle, the replay)', () => {
    const motion = new WaterMotion();
    for (let i = 0; i < 10; i++) motion.step(frame, 0, 0);
    motion.step(frame, 50, 0);
    expect(motion.down(0)).toEqual({ x: 0, y: 1 });
  });

  it('ignores a zero frame time', () => {
    const motion = new WaterMotion();
    motion.step(0, 1, 1);
    expect(motion.down(0).y).toBeCloseTo(1, 6);
  });
});
