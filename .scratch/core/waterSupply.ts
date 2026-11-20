import { drawWaterLevel } from './bottle';
import type { Rng } from './rng';
import type { Tuning } from './tuning';

const clampWater = (level: number): number => Math.min(1, Math.max(0, level));

/**
 * Where each bottle's water level comes from: the seed's next random draw, or a level that tuning
 * tools have locked. The draw is made for every bottle even while a level is locked, so unlocking
 * carries on with the seed's own sequence, as if nothing had been locked.
 */
export class WaterSupply {
  private lockedLevel: number | null = null;

  constructor(
    private readonly rng: Rng,
    private readonly tuning: () => Tuning,
    lockedWater: number | null = null,
  ) {
    this.lock(lockedWater);
  }

  /** The locked level, or null while the levels are random. */
  get locked(): number | null {
    return this.lockedLevel;
  }

  /**
   * Give every later bottle this level (clamped to 0..1), or `null` to go back to the seeded
   * random levels. A number that isn't finite is ignored. Returns the level this call locked, or
   * null if it unlocked or ignored the number.
   */
  lock(level: number | null): number | null {
    if (level === null) {
      this.lockedLevel = null;
      return null;
    }
    if (!Number.isFinite(level)) return null;
    this.lockedLevel = clampWater(level);
    return this.lockedLevel;
  }

  /** The water level of the next bottle: the lock if there is one, else the seed's next draw. */
  next(): number {
    const drawn = drawWaterLevel(this.rng, this.tuning());
    return this.lockedLevel ?? drawn;
  }
}
