import { drawWaterLevel } from './bottle';
import { findWindows, sweepPowers, widestWindow, type SweepPoint } from './flipWindow';
import { createRng, type Rng } from './rng';
import { MAX_POWER, MIN_POWER } from './throw';
import { resolveTuning, type Tuning } from './tuning';

/*
 * The difficulty benchmark (F020): how often do simulated players land a bottle with the current
 * tuning? It is a proxy for the design's targets in section 3 (an attentive new player lands about
 * 3 of 10, a practiced player 6 to 8 of 10, and no single fixed power lands most bottles). The real
 * answer comes from a human playing; the models below are assumptions to confirm by playing.
 *
 * Everything runs the real `Simulation` through `sweepPowers` (one sweep per distinct water level,
 * then every throw is a table lookup), so the benchmark never reimplements a rule, and it is
 * deterministic for a seed: the bottles and each player's errors come from their own streams of
 * the seeded generator, and no clock or `Math.random()` is read.
 *
 * The player models:
 *
 * - **Practiced player.** Reads the water level and knows that bottle's power. It aims at the
 *   center of the bottle's own single-flip window, then misses by a random error.
 * - **New player.** Has not learned the water yet. It aims at one fixed power for every bottle:
 *   the average of the bottles' window centers (the best single guess for someone who ignores the
 *   water), then misses by the same kind of random error.
 * - **The error** is normal (a bell curve) with a standard deviation of `errorSigma` points of
 *   power, about 8 by default: how far a hand misses the power it meant (a key tap moves the bar 1
 *   point, a wheel notch 2, a push of the mouse is much less exact). The thrown power is the aim
 *   plus the error, rounded to a whole power and kept between 0 and 100.
 * - **Landing** is a success of any kind (a single, a double...): the targets count landings,
 *   not points. Points are the sum of the points of those throws, shown per 10 throws.
 * - **The best fixed power** is the single power from 0 to 100 that lands the most of the same
 *   bottles with no error at all: how far "ignore the water" could go for a perfect hand. The
 *   **best-scoring fixed power** is the one that scores the most points the same way: it is
 *   usually a high power that lands double and triple flips, which the landing targets don't see.
 */

/** How many bottles a benchmark throws by default (design: 200 random bottles). */
export const BENCHMARK_BOTTLES = 200;

/** The default standard deviation, in points of power, of a simulated player's error. */
export const DEFAULT_ERROR_SIGMA = 8;

/** The seed of the default benchmark: bottles are drawn from it, so the same seed is the same run. */
export const BENCHMARK_SEED = 1;

export interface BenchmarkOptions {
  /** Seed of the bottles and of the players' errors. Default `BENCHMARK_SEED`. */
  seed?: number;
  /** Number of bottles (and throws per player). Default `BENCHMARK_BOTTLES`. */
  bottles?: number;
  /** Standard deviation of the players' aim error, in points of power. Default 8. */
  errorSigma?: number;
  /** Overrides of the default tuning to benchmark. */
  tuning?: Partial<Tuning>;
  /**
   * How a bottle with this water level is thrown at every power from 0 to 100. Default: the real
   * simulation (`sweepPowers` with `tuning`). Tests give a made-up one to check the player models
   * without running physics.
   */
  sweep?: (water: number) => readonly BenchmarkThrow[];
}

/** The part of a sweep point the benchmark reads: how a throw at `power` ended. */
export type BenchmarkThrow = Pick<SweepPoint, 'power' | 'result' | 'turns' | 'points'>;

/** What one kind of player achieved over the benchmark's throws. */
export interface PlayerResult {
  /** Throws that ended in a success. */
  landings: number;
  /** `landings` divided by the number of throws, 0 to 1. */
  landingRate: number;
  /** Total points of the throws. */
  points: number;
  /** Points per 10 throws: the average score of a round. */
  pointsPer10: number;
}

/** What throwing every bottle at one power, with no error, achieves. */
export interface FixedPowerResult {
  power: number;
  landings: number;
  landingRate: number;
  /** Points per 10 throws. */
  pointsPer10: number;
}

export interface BenchmarkResult {
  seed: number;
  bottles: number;
  errorSigma: number;
  /** The aims of the two models: the fixed power of the new player (a fraction is kept). */
  newPlayerAim: number;
  practiced: PlayerResult;
  newPlayer: PlayerResult;
  /** The fixed power that lands the most bottles with no error, and what it lands and scores. */
  bestFixed: FixedPowerResult;
  /**
   * The fixed power that scores the most points with no error. It is usually a high power that
   * lands double and triple flips: if it scores far more than the practiced player, "full power
   * every time" beats reading the water, whatever the landing rates say.
   */
  bestScoringFixed: FixedPowerResult;
  /** Window centers of the distinct water levels in the draw, rising with the water, by level. */
  centers: { water: number; center: number }[];
}

/** A number from the normal distribution (mean 0, standard deviation 1), by Box-Muller. */
export function normalSample(rng: Rng): number {
  // `next()` is in [0, 1), so 1 - next() is in (0, 1] and the logarithm is finite.
  const u = 1 - rng.next();
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Round a power to a whole number and keep it on the bar. */
const toPower = (power: number): number =>
  Math.min(MAX_POWER, Math.max(MIN_POWER, Math.round(power)));

/**
 * Run the benchmark: draw `bottles` random bottles with the tuning's water levels, sweep each
 * distinct level once, and let the practiced and the new player throw at every bottle.
 */
export function runBenchmark(options: BenchmarkOptions = {}): BenchmarkResult {
  const seed = options.seed ?? BENCHMARK_SEED;
  const bottles = options.bottles ?? BENCHMARK_BOTTLES;
  const errorSigma = options.errorSigma ?? DEFAULT_ERROR_SIGMA;
  const tuning = resolveTuning(options.tuning);

  // The bottles: the same draw the game makes (one `drawWaterLevel` per bottle).
  const waterRng = createRng(seed);
  const levels = Array.from({ length: bottles }, () => drawWaterLevel(waterRng, tuning));

  // One sweep per distinct level: sweeps.get(water)[power] is how a throw at that power ended.
  const sweep = options.sweep ?? ((water: number) => sweepPowers(water, tuning));
  const sweeps = new Map<number, BenchmarkThrow[]>();
  const centers = new Map<number, number>();
  for (const water of new Set(levels)) {
    const points = sweep(water);
    const byPower: BenchmarkThrow[] = [];
    for (const point of points) byPower[point.power] = point;
    sweeps.set(water, byPower);
    const single = widestWindow(findWindows(points), 1);
    // A level with no single window has no power to aim at: the practiced player guesses the middle.
    centers.set(water, single ? single.center : MAX_POWER / 2);
  }

  const centerOf = (water: number): number => centers.get(water)!;
  const outcomeAt = (water: number, power: number): BenchmarkThrow => sweeps.get(water)![power]!;
  const newPlayerAim = levels.reduce((sum, water) => sum + centerOf(water), 0) / bottles;

  // Each player has its own stream of errors, so changing one model never moves the other's.
  const play = (seedOffset: number, aim: (water: number) => number): PlayerResult => {
    const rng = createRng(seed + seedOffset);
    let landings = 0;
    let points = 0;
    for (const water of levels) {
      const outcome = outcomeAt(water, toPower(aim(water) + errorSigma * normalSample(rng)));
      if (outcome.result === 'success') {
        landings++;
        points += outcome.points;
      }
    }
    return {
      landings,
      landingRate: landings / bottles,
      points,
      pointsPer10: (points / bottles) * 10,
    };
  };
  const practiced = play(1, centerOf);
  const newPlayer = play(2, () => newPlayerAim);

  // Every whole power thrown at every bottle with no error. The first power wins a tie, so the
  // lowest of several equally good powers is the one reported.
  let bestFixed: FixedPowerResult | null = null;
  let bestScoringFixed: FixedPowerResult | null = null;
  for (let power = MIN_POWER; power <= MAX_POWER; power++) {
    let landings = 0;
    let points = 0;
    for (const water of levels) {
      const outcome = outcomeAt(water, power);
      if (outcome.result !== 'success') continue;
      landings++;
      points += outcome.points;
    }
    const fixed = {
      power,
      landings,
      landingRate: landings / bottles,
      pointsPer10: (points / bottles) * 10,
    };
    if (!bestFixed || landings > bestFixed.landings) bestFixed = fixed;
    if (!bestScoringFixed || fixed.pointsPer10 > bestScoringFixed.pointsPer10) {
      bestScoringFixed = fixed;
    }
  }

  return {
    seed,
    bottles,
    errorSigma,
    newPlayerAim,
    practiced,
    newPlayer,
    bestFixed: bestFixed!,
    bestScoringFixed: bestScoringFixed!,
    centers: [...centers]
      .map(([water, center]) => ({ water, center }))
      .sort((a, b) => a.water - b.water),
  };
}
