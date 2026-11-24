import { describe, expect, it } from 'vitest';
import { BOTTLE_BODY_HEIGHT, waterRect, type Point } from '../../src/core/bottleShape';
import {
  polygonArea,
  WaterMotion,
  waterShape,
  waterVolume,
  type Pose,
} from '../../src/game/view/waterSurface';

const total = (pieces: readonly Point[][]): number =>
  pieces.reduce((sum, piece) => sum + polygonArea(piece), 0);
const ys = (pieces: readonly Point[][]): number[] => pieces.flat().map((p) => p.y);
const xs = (pieces: readonly Point[][]): number[] => pieces.flat().map((p) => p.x);

describe('waterShape', () => {
  it('keeps the upright volume at every tilt and level', () => {
    for (const level of [0.1, 0.3, 0.5, 0.9, 1]) {
      for (let deg = 0; deg < 360; deg += 15) {
        const a = (deg * Math.PI) / 180;
        const shape = waterShape(level, { x: Math.sin(a), y: Math.cos(a) })!;
        expect(total(shape.pieces)).toBeCloseTo(waterVolume(level), 5);
      }
    }
  });

  it('is the flat fill at the base when upright', () => {
    const shape = waterShape(0.4, { x: 0, y: 1 })!;
    const r = waterRect(0.4)!;
    expect(Math.min(...ys(shape.pieces))).toBeCloseTo(r.y0, 6);
    expect(Math.max(...ys(shape.pieces))).toBeCloseTo(r.y1, 6);
    expect(shape.surface).toHaveLength(1);
    expect(shape.surface[0]![0].y).toBeCloseTo(r.y0, 6);
    expect(shape.surface[0]![1].y).toBeCloseTo(r.y0, 6);
  });

  it('spreads along the lower wall when the bottle lies on its side', () => {
    // Down is the bottle's +x side: the water is a layer against that wall, along the whole length.
    const shape = waterShape(0.5, { x: 1, y: 0 })!;
    const r = waterRect(1)!;
    expect(Math.max(...xs(shape.pieces))).toBeCloseTo(r.x1, 6);
    expect(-Math.min(...ys(shape.pieces))).toBeGreaterThan(BOTTLE_BODY_HEIGHT);
    expect(Math.max(...xs(shape.pieces)) - Math.min(...xs(shape.pieces))).toBeLessThan(
      0.6 * (r.x1 - r.x0),
    );
  });

  it('runs into the shoulder and neck when the bottle stands on its cap', () => {
    const shape = waterShape(0.3, { x: 0, y: -1 })!;
    expect(shape.pieces).toHaveLength(3);
    // The base end is dry: all the water is toward the cap.
    expect(Math.max(...ys(shape.pieces))).toBeLessThan(-0.5);
    expect(total(shape.pieces)).toBeCloseTo(waterVolume(0.3), 5);
  });

  it('has no surface when nothing is empty and no shape when there is no water', () => {
    expect(waterShape(1, { x: 0, y: 1 })!.surface.length).toBeLessThanOrEqual(1);
    expect(waterShape(0, { x: 0, y: 1 })).toBeNull();
  });
});

describe('WaterMotion', () => {
  const frame = 1 / 60;
  const center = 0.45;
  const water = 0.2;

  it('settles toward gravity for a bottle at rest, at any angle', () => {
    const motion = new WaterMotion();
    for (let i = 0; i < 120; i++) motion.step(frame, { x: 5, y: 5, angle: 0 }, center, water);
    expect(motion.down().x).toBeCloseTo(0, 6);
    expect(motion.down().y).toBeCloseTo(1, 6);
    // Lying a quarter turn clockwise, the world's down is the bottle's own +x side.
    const lying = new WaterMotion();
    for (let i = 0; i < 300; i++)
      lying.step(frame, { x: 5, y: 5, angle: Math.PI / 2 }, center, water);
    expect(lying.down().x).toBeCloseTo(1, 3);
    expect(lying.down().y).toBeCloseTo(0, 3);
  });

  it('stays pressed to the base while the bottle spins in free flight', () => {
    const motion = new WaterMotion();
    const omega = 10;
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      const t = i * frame;
      // The center of mass flies on a parabola, the bottle turns about it.
      const angle = omega * t;
      const cx = 3 * t;
      const cy = -6 * t + (9.81 * t * t) / 2;
      const pose: Pose = {
        x: cx - center * Math.sin(angle),
        y: cy + center * Math.cos(angle),
        angle,
      };
      motion.step(frame, pose, center, water);
      if (i > 15) worst = Math.max(worst, Math.abs(motion.down().x));
    }
    expect(motion.down().y).toBeGreaterThan(0.97);
    expect(worst).toBeLessThan(0.25);
  });

  it('tilts when the bottle stops suddenly, then settles again', () => {
    const motion = new WaterMotion();
    let x = 0;
    for (let i = 0; i < 30; i++) {
      x += 6 * frame; // moving right at 6 m/s
      motion.step(frame, { x, y: 5, angle: 0 }, center, water);
    }
    let maxTilt = 0;
    for (let i = 0; i < 20; i++) {
      motion.step(frame, { x, y: 5, angle: 0 }, center, water); // stops dead
      maxTilt = Math.max(maxTilt, Math.abs(motion.down().x));
    }
    expect(maxTilt).toBeGreaterThan(0.05);
    for (let i = 0; i < 300; i++) motion.step(frame, { x, y: 5, angle: 0 }, center, water);
    expect(Math.abs(motion.down().x)).toBeLessThan(0.01);
  });

  it('starts over after a jump of the pose (a new bottle, the replay)', () => {
    const motion = new WaterMotion();
    for (let i = 0; i < 10; i++) motion.step(frame, { x: 0, y: 0, angle: 0 }, center, water);
    // Tip the water over, then jump: it starts again on the base.
    for (let i = 0; i < 60; i++) motion.step(frame, { x: 0, y: 0, angle: Math.PI }, center, water);
    expect(motion.down().y).toBeLessThan(-0.9);
    motion.step(frame, { x: 50, y: 0, angle: Math.PI }, center, water);
    expect(motion.down()).toEqual({ x: 0, y: 1 });
  });

  it('does not fling the water when it starts on a bottle already in flight (the replay)', () => {
    const motion = new WaterMotion();
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const t = i * frame;
      // Already moving at 4 m/s sideways and 3 m/s down, barely turning, lying on its side.
      const pose: Pose = { x: 4 * t, y: 3 * t + (9.81 * t * t) / 2, angle: Math.PI / 2 + 0.2 * t };
      motion.step(frame, pose, center, water);
      worst = Math.max(worst, Math.abs(motion.down().x));
    }
    expect(worst).toBeLessThan(0.2);
  });

  it('starts over on restart()', () => {
    const motion = new WaterMotion();
    for (let i = 0; i < 60; i++) motion.step(frame, { x: 0, y: 0, angle: Math.PI }, center, water);
    motion.restart();
    motion.step(frame, { x: 0, y: 0, angle: Math.PI }, center, water);
    expect(motion.down()).toEqual({ x: 0, y: 1 });
  });

  it('ignores a zero frame time', () => {
    const motion = new WaterMotion();
    motion.step(0, { x: 1, y: 1, angle: 0 }, center, water);
    expect(motion.down()).toEqual({ x: 0, y: 1 });
  });
});
