import { SIM_HZ, stepsFor } from '../../core/constants';

/*
 * The camera shake as a pure function of simulation ticks, so it is the same on every run, it
 * freezes with the game and a test that steps the simulation lands on an exact frame of it. There
 * is no randomness: two sines at unrelated rates move the picture on each axis, and the push dies
 * away in a straight line, so the offset never goes beyond the intensity.
 */

export interface Offset {
  x: number;
  y: number;
}

const REST: Readonly<Offset> = { x: 0, y: 0 };
/** How many times a second the picture swings sideways and up and down: not a multiple of each other. */
const X_HZ = 13;
const Y_HZ = 17;
const Y_PHASE = 1.3;

/**
 * Where a shake of `intensity` pixels has moved the picture `age` steps after it began, when it
 * lasts `total` steps: it is at rest from step `total` on, and its largest swing at any step is the
 * intensity times what is left of the shake (1 at the start, 0 at the end).
 */
export function shakeOffset(intensity: number, age: number, total: number): Offset {
  if (!(intensity > 0) || age < 0 || age >= total) return { ...REST };
  const left = 1 - age / total;
  const seconds = age / SIM_HZ;
  return {
    x: intensity * left * Math.sin(2 * Math.PI * X_HZ * seconds),
    y: intensity * left * Math.sin(2 * Math.PI * Y_HZ * seconds + Y_PHASE),
  };
}

/** The shake in progress, if any. A harder impact takes over from a weaker shake; a softer one is ignored. */
export class ShakeEffect {
  private current: { tick: number; intensity: number; steps: number } | null = null;

  /** Start a shake at `tick`, unless the one in progress still has more left than this would give. */
  trigger(tick: number, intensity: number, seconds: number): void {
    if (!(intensity > 0)) return;
    const steps = stepsFor(seconds);
    const current = this.current;
    if (current && tick - current.tick < current.steps) {
      const remaining = current.intensity * (1 - (tick - current.tick) / current.steps);
      if (remaining > intensity) return;
    }
    this.current = { tick, intensity, steps };
  }

  /** Where the picture is at `tick`: at rest (0, 0) when no shake is on. */
  offset(tick: number): Offset {
    const current = this.current;
    if (!current) return { ...REST };
    const age = tick - current.tick;
    if (age >= current.steps) {
      this.current = null;
      return { ...REST };
    }
    return shakeOffset(current.intensity, age, current.steps);
  }

  /** Stop at once. */
  clear(): void {
    this.current = null;
  }
}
