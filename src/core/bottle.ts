import { Polygon, type Body, type Fixture, type World } from 'planck';
import { BOTTLE_PARTS, waterVertices, type Point } from './bottleShape';
import type { Rng } from './rng';
import { TABLE_LEFT_X, TABLE_TOP_Y } from './table';
import type { Tuning } from './tuning';

/*
 * The bottle as a physics body: the plastic shell from four convex fixtures (body, shoulder, neck,
 * cap) plus the water as one more fixture that adds mass but never collides. The geometry comes
 * from bottleShape.ts, which the drawing uses too.
 */

/**
 * Where the bottle waits before a throw: the center of its base, above the table near the left
 * end. The base hangs 1 m above the tabletop, 1.2 m in from the left end.
 */
export const HAND_X = TABLE_LEFT_X + 1.2;
export const HAND_Y = TABLE_TOP_Y - 1;

const toVec = (points: readonly Point[]): { x: number; y: number }[] =>
  points.map((p) => ({ x: p.x, y: p.y }));

/**
 * Pick the water level for the next bottle from the seeded RNG: `waterMin` plus a whole number
 * of `waterStep`s, up to `waterMax`. Consumes exactly one random number.
 */
export function drawWaterLevel(rng: Rng, tuning: Tuning): number {
  const steps = Math.max(0, Math.round((tuning.waterMax - tuning.waterMin) / tuning.waterStep));
  const level = tuning.waterMin + rng.int(0, steps) * tuning.waterStep;
  // Round away floating-point noise so levels are clean numbers such as 0.15.
  return Math.round(level * 1e6) / 1e6;
}

export class Bottle {
  readonly body: Body;
  private waterFixture: Fixture | null = null;
  private level = 0;

  /**
   * Creates the bottle held in the hand: upright, still and unaffected by gravity (a kinematic
   * body). A throw makes it dynamic with `release()`.
   */
  constructor(
    world: World,
    private readonly tuning: Tuning,
    water: number,
  ) {
    this.body = world.createBody({
      type: 'kinematic',
      position: { x: HAND_X, y: HAND_Y },
      bullet: true,
    });
    for (const part of BOTTLE_PARTS) {
      this.body.createFixture({
        shape: new Polygon(toVec(part.vertices)),
        density: tuning.shellDensity,
        friction: tuning.bottleFriction,
        restitution: tuning.bottleRestitution,
      });
    }
    this.setWater(water);
  }

  /** Water level, the filled fraction of the body (0 to 1). */
  get water(): number {
    return this.level;
  }

  /** Change the water level (clamped to 0..1), rebuilding the water's mass. */
  setWater(level: number): void {
    this.level = Math.min(1, Math.max(0, level));
    if (this.waterFixture) this.body.destroyFixture(this.waterFixture);
    this.waterFixture = null;
    const vertices = waterVertices(this.level);
    if (!vertices) return;
    this.waterFixture = this.body.createFixture({
      shape: new Polygon(toVec(vertices)),
      density: this.tuning.waterDensity,
      // Water only adds mass. It never touches the table or anything else.
      isSensor: true,
      filterMaskBits: 0,
    });
  }

  /** Let go of the bottle: it becomes a normal dynamic body that gravity moves. */
  release(): void {
    this.body.setType('dynamic');
  }
}
