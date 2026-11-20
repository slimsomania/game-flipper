/**
 * Fixed-timestep accumulator.
 *
 * The browser renders at whatever frame rate it likes; the simulation always advances in exact
 * steps of `dtSeconds`, so its results don't depend on the display and tests can reproduce them.
 */
export interface FixedStepper {
  /** Feed real elapsed time in milliseconds. Calls `step` zero or more times; returns how many. */
  advance(elapsedMs: number, step: () => void): number;
  /** Fraction (0..1) of a step waiting in the accumulator, for render interpolation. */
  readonly alpha: number;
  /** Forget any accumulated time. */
  reset(): void;
}

/** Tolerance for floating-point drift when comparing accumulated time with the step size. */
const EPSILON = 1e-9;

export function createFixedStepper(dtSeconds: number, maxStepsPerAdvance = 5): FixedStepper {
  let accumulated = 0;

  return {
    advance(elapsedMs, step) {
      accumulated += Math.max(0, elapsedMs) / 1000;
      let steps = 0;
      while (accumulated + EPSILON >= dtSeconds && steps < maxStepsPerAdvance) {
        step();
        accumulated = Math.max(0, accumulated - dtSeconds);
        steps++;
      }
      // Too far behind (e.g. the tab was hidden): drop the backlog instead of fast-forwarding.
      if (accumulated + EPSILON >= dtSeconds) accumulated = 0;
      return steps;
    },
    get alpha() {
      return Math.min(1, accumulated / dtSeconds);
    },
    reset() {
      accumulated = 0;
    },
  };
}
