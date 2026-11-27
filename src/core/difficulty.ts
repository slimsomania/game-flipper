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
export type BenchmarkThrow = Pick<SweepPoint, 'power' | 'result' | 'turns' | 'points'> &
  Partial<Pick<SweepPoint, 'reason'>>;

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
  /** What the two players land in the long run, with no luck of the draw (see `ExpectedRates`). */
  expected: ExpectedRates;
}

/**
 * The exact expected landing rates of the two players, 0 to 1. A benchmark of 200 throws is one
 * lucky or unlucky draw (the rate of a seed swings by 5 to 10 points), so tuning is judged on these:
 * every water level from the tuning's lowest to its highest counts equally (the game draws them
 * evenly), and each player's error is integrated over every power instead of sampled. The new
 * player's aim is the average of those levels' window centers.
 *
 * The points are computed the same way: `practicedPointsPer10` is what the practiced player scores
 * per 10 throws, and `bestFixedAim` is the one power that scores the most when thrown at every
 * bottle with the same error. It shows whether ignoring the water and going for doubles pays.
 */
export interface ExpectedRates {
  practiced: number;
  newPlayer: number;
  newPlayerAim: number;
  practicedPointsPer10: number;
  bestFixedAim: { aim: number; pointsPer10: number };
  /**
   * The worst cap-farming chance: over every water level and every whole aim 0 to 100, the largest
   * chance that one throw (with the error) lands on the cap for the full `capPoints`.
   */
  worstCap: { water: number; aim: number; chance: number };
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

/** The standard normal distribution function Φ(x) (error below 1e-7: Abramowitz and Stegun 7.1.26). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + (x >= 0 ? erf : -erf));
}

/**
 * The chance of each whole power from 0 to 100 being thrown by a player who aims at `aim` and
 * misses by a normal error of `sigma` points: the aim plus the error, rounded, kept on the bar (so
 * the tails pile up on 0 and on 100). The chances add up to 1.
 */
export function powerChances(aim: number, sigma: number): number[] {
  const chances: number[] = [];
  for (let power = MIN_POWER; power <= MAX_POWER; power++) {
    if (sigma <= 0) {
      chances.push(power === toPower(aim) ? 1 : 0);
      continue;
    }
    const below = power === MIN_POWER ? 0 : normalCdf((power - 0.5 - aim) / sigma);
    const above = power === MAX_POWER ? 1 : normalCdf((power + 0.5 - aim) / sigma);
    chances.push(above - below);
  }
  return chances;
}

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
  const sweepLevel = (water: number): void => {
    if (sweeps.has(water)) return;
    const points = sweep(water);
    const byPower: BenchmarkThrow[] = [];
    for (const point of points) byPower[point.power] = point;
    sweeps.set(water, byPower);
    const single = widestWindow(findWindows(points), 1);
    // A level with no single window has no power to aim at: the practiced player guesses the middle.
    centers.set(water, single ? single.center : MAX_POWER / 2);
  };
  const drawn = new Set(levels);
  for (const water of drawn) sweepLevel(water);

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

  // The exact expected rates: every level the game can draw, equally likely, and each player's
  // error integrated over every power (`powerChances`) instead of sampled.
  const steps = Math.max(0, Math.round((tuning.waterMax - tuning.waterMin) / tuning.waterStep));
  const everyLevel = Array.from(
    { length: steps + 1 },
    (_, i) => Math.round((tuning.waterMin + i * tuning.waterStep) * 1e6) / 1e6,
  );
  for (const water of everyLevel) sweepLevel(water);
  const expectedAim =
    everyLevel.reduce((sum, water) => sum + centerOf(water), 0) / everyLevel.length;
  const landChance = (water: number, aim: number): number => {
    const chances = powerChances(aim, errorSigma);
    let total = 0;
    for (let power = MIN_POWER; power <= MAX_POWER; power++) {
      if (outcomeAt(water, power).result === 'success') total += chances[power]!;
    }
    return total;
  };
  // Expected points of one throw at `water` aimed at `aim`, with the same error.
  const pointsChance = (water: number, aim: number): number => {
    const chances = powerChances(aim, errorSigma);
    let total = 0;
    for (let power = MIN_POWER; power <= MAX_POWER; power++) {
      const outcome = outcomeAt(water, power);
      if (outcome.result === 'success') total += chances[power]! * outcome.points;
    }
    return total;
  };
  const per10 = (aimOf: (water: number) => number): number =>
    (everyLevel.reduce((sum, water) => sum + pointsChance(water, aimOf(water)), 0) /
      everyLevel.length) *
    10;
  // The lowest of several equally good aims wins a tie, as for the fixed powers above.
  let bestFixedAim = { aim: MIN_POWER, pointsPer10: -1 };
  for (let aim = MIN_POWER; aim <= MAX_POWER; aim++) {
    const pointsPer10 = per10(() => aim);
    if (pointsPer10 > bestFixedAim.pointsPer10) bestFixedAim = { aim, pointsPer10 };
  }
  // Cap farming: a fixed aim that keeps landing on the cap for the full capPoints.
  let worstCap = { water: everyLevel[0]!, aim: MIN_POWER, chance: -1 };
  for (const water of everyLevel) {
    for (let aim = MIN_POWER; aim <= MAX_POWER; aim++) {
      const chances = powerChances(aim, errorSigma);
      let chance = 0;
      for (let power = MIN_POWER; power <= MAX_POWER; power++) {
        const outcome = outcomeAt(water, power);
        if (outcome.reason === 'cap' && outcome.points === tuning.capPoints) {
          chance += chances[power]!;
        }
      }
      if (chance > worstCap.chance) worstCap = { water, aim, chance };
    }
  }
  const expected: ExpectedRates = {
    practiced:
      everyLevel.reduce((sum, water) => sum + landChance(water, centerOf(water)), 0) /
      everyLevel.length,
    newPlayer:
      everyLevel.reduce((sum, water) => sum + landChance(water, expectedAim), 0) /
      everyLevel.length,
    newPlayerAim: expectedAim,
    practicedPointsPer10: per10(centerOf),
    bestFixedAim,
    worstCap,
  };

  return {
    seed,
    bottles,
    errorSigma,
    expected,
    newPlayerAim,
    practiced,
    newPlayer,
    bestFixed: bestFixed!,
    bestScoringFixed: bestScoringFixed!,
    centers: [...centers]
      .filter(([water]) => drawn.has(water))
      .map(([water, center]) => ({ water, center }))
      .sort((a, b) => a.water - b.water),
  };
}
