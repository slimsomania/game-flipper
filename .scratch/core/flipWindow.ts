import { stepsFor } from './constants';
import type { Outcome } from './outcome';
import { Simulation } from './simulation';
import { MAX_POWER, MIN_POWER } from './throw';
import { resolveTuning, type Tuning } from './tuning';

/*
 * Measuring the throw: a sweep throws one bottle at every power from 0 to 100 and records how each
 * throw ended, and `findWindows` turns those results into windows of power that succeed with the
 * same number of turns. Calibration (F009), the tuning panel (F010) and the difficulty benchmark
 * (F020) all read the game's feel through here, so they never reimplement a rule: a sweep runs the
 * real `Simulation`, only without a scene, and `findWindows` is pure arithmetic on its results.
 */

/** How one throw of a sweep ended: the `Outcome` plus the power thrown and the steps it took. */
export interface SweepPoint extends Outcome {
  power: number;
  /** Fixed steps from the release to the step that decided the outcome (the run stops there). */
  steps: number;
}

/** The part of a `SweepPoint` that `findWindows` reads, so hand-made lists stay short. */
export type SweepResult = Pick<SweepPoint, 'power' | 'result' | 'turns'>;

/** A run of neighboring powers that all succeed with the same number of turns. */
export interface FlipWindow {
  /** Turns of the throws in the window: 1 is a single flip. */
  turns: number;
  /** The lowest and highest power in the window. */
  low: number;
  high: number;
  /** Halfway between `low` and `high`. */
  center: number;
  /** `high - low`: the span of powers that were measured, 0 for a window of one power. */
  width: number;
}

/** Every whole power from 0 to 100, the default of a sweep. */
export const SWEEP_POWERS: readonly number[] = Array.from(
  { length: MAX_POWER - MIN_POWER + 1 },
  (_, i) => MIN_POWER + i,
);

/** The seed of a sweep's simulations. It doesn't matter (the water level is set), but it is fixed. */
const SWEEP_SEED = 1;

/**
 * Throw a bottle holding `water` (0 to 1) at each of `powers` (default: every whole power from 0 to
 * 100) with `tuning` (overrides of the defaults) and return how each throw ended, in the order of
 * `powers`. Every throw is a fresh `Simulation` stepped only until its outcome is decided, so a
 * sweep is deterministic, and it never waits for the result phase. A throw that the judge somehow
 * never decides is an error rather than a hang.
 */
export function sweepPowers(
  water: number,
  tuning: Partial<Tuning> = {},
  powers: readonly number[] = SWEEP_POWERS,
): SweepPoint[] {
  const resolved = resolveTuning(tuning);
  // The judge's own timeout decides every throw; the margin only guards against a bug.
  const limit = stepsFor(resolved.timeoutSeconds) + 2;
  return powers.map((power) => {
    const sim = new Simulation({ seed: SWEEP_SEED, tuning: resolved });
    sim.setWater(water);
    if (!sim.throwBottle(power)) throw new Error(`The throw at power ${power} was not accepted`);
    let steps = 0;
    while (steps < limit && sim.phase === 'flying') {
      sim.step();
      steps++;
    }
    const outcome = sim.snapshot().outcome;
    if (!outcome)
      throw new Error(`The throw at power ${power} had no outcome after ${limit} steps`);
    return { power, steps, ...outcome };
  });
}

/**
 * Group sweep results into windows: each window is a run of neighboring results (after sorting by
 * power) that are all successes with the same `turns`. A failure, or a success with a different
 * number of turns, ends the run. Returns the windows from the lowest power up. Pure: it runs no
 * physics, and the input is left as it was.
 */
export function findWindows(results: readonly SweepResult[]): FlipWindow[] {
  const sorted = [...results].sort((a, b) => a.power - b.power);
  const windows: FlipWindow[] = [];
  let open: { turns: number; low: number; high: number } | null = null;
  const close = (): void => {
    if (!open) return;
    const { turns, low, high } = open;
    windows.push({ turns, low, high, center: (low + high) / 2, width: high - low });
    open = null;
  };
  for (const r of sorted) {
    if (r.result !== 'success') {
      close();
    } else if (open && open.turns === r.turns) {
      open.high = r.power;
    } else {
      close();
      open = { turns: r.turns, low: r.power, high: r.power };
    }
  }
  close();
  return windows;
}

/**
 * The widest window with exactly `turns` turns (the first one if several are as wide), or null if
 * there is none. `turns` 1 is the single flip window.
 */
export function widestWindow(windows: readonly FlipWindow[], turns = 1): FlipWindow | null {
  let best: FlipWindow | null = null;
  for (const w of windows) {
    if (w.turns === turns && (!best || w.width > best.width)) best = w;
  }
  return best;
}
