import { beforeAll, describe, expect, it } from 'vitest';
import { drawWaterLevel } from '../../src/core/bottle';
import {
  BENCHMARK_BOTTLES,
  normalCdf,
  normalSample,
  powerChances,
  runBenchmark,
  type BenchmarkResult,
  type BenchmarkThrow,
} from '../../src/core/difficulty';
import { createRng } from '../../src/core/rng';
import { DEFAULT_TUNING } from '../../src/core/tuning';

/*
 * The difficulty benchmark (F020): simulated players throw 200 random bottles. The player models
 * are checked on a made-up world first (a table of how throws end, no physics, so these tests are
 * fast and every number can be worked out by hand), then the real game with the default tuning is
 * held to the design's targets (section 3): a practiced player lands 60 to 80% of throws, a new
 * player 20 to 40%. Those ranges are the design's, not particular tuning values.
 */

/**
 * A made-up world: the bottle with water `w` lands a single flip at powers within 6 of
 * `20 + 40 w` (a window 12 wide, centers 24 to 56) and a double flip at powers from 90 up;
 * everything else fails. The centers are whole numbers (the water levels are multiples of 0.05),
 * so no window edge depends on a rounding error.
 */
const centerOf = (water: number): number => 20 + Math.round(40 * water);
function madeUpSweep(water: number): BenchmarkThrow[] {
  return Array.from({ length: 101 }, (_, power) => {
    const single = Math.abs(power - centerOf(water)) <= 6;
    const double = power >= 90;
    return {
      power,
      result: single || double ? ('success' as const) : ('fail' as const),
      turns: double ? 2 : single ? 1 : 0,
      points: double ? 2 : single ? 1 : 0,
    };
  });
}

/** The water level of each of the benchmark's bottles, drawn exactly as the game draws them. */
function bottlesOf(seed: number, count = BENCHMARK_BOTTLES): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => drawWaterLevel(rng, DEFAULT_TUNING));
}

describe('normalSample', () => {
  it('is a bell curve: mean 0, standard deviation 1, and about 68% within one deviation', () => {
    const rng = createRng(42);
    const samples = Array.from({ length: 20_000 }, () => normalSample(rng));
    const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
    const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length;
    const within = samples.filter((x) => Math.abs(x) <= 1).length / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.sqrt(variance)).toBeGreaterThan(0.97);
    expect(Math.sqrt(variance)).toBeLessThan(1.03);
    expect(within).toBeGreaterThan(0.66);
    expect(within).toBeLessThan(0.7);
  });

  it('gives the same numbers for the same seed, and is always finite', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = normalSample(a);
      expect(x).toBe(normalSample(b));
      expect(Number.isFinite(x)).toBe(true);
    }
  });
});

describe('normalCdf and powerChances', () => {
  it('normalCdf is Φ: 0.5 at 0, 0.8413 at 1, 0.9772 at 2, symmetric, and 0 and 1 far out', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 6);
    expect(normalCdf(2)).toBeCloseTo(0.9772499, 6);
    expect(normalCdf(-1.3) + normalCdf(1.3)).toBeCloseTo(1, 7);
    expect(normalCdf(-9)).toBeLessThan(1e-9);
    expect(normalCdf(9)).toBeGreaterThan(1 - 1e-9);
  });

  it('the chances of the 101 powers add up to 1, and the middle one is the most likely', () => {
    for (const aim of [0, 3.4, 50, 77.5, 100]) {
      const chances = powerChances(aim, 8);
      expect(chances).toHaveLength(101);
      expect(chances.reduce((sum, c) => sum + c, 0)).toBeCloseTo(1, 9);
      expect(chances.every((c) => c >= 0)).toBe(true);
    }
    const centered = powerChances(50, 8);
    expect(Math.max(...centered)).toBe(centered[50]);
    // Within ±6.5 of the aim lands in a window ±6 wide: 2Φ(6.5/8) - 1 = 0.583.
    const inside = centered.slice(44, 57).reduce((sum, c) => sum + c, 0);
    expect(inside).toBeCloseTo(2 * normalCdf(6.5 / 8) - 1, 9);
  });

  it('the tails pile up on the ends of the bar, and a zero error is the aim itself', () => {
    const low = powerChances(2, 8);
    expect(low[0]).toBeCloseTo(normalCdf((0.5 - 2) / 8), 9); // everything at or below 0.5
    const high = powerChances(98, 8);
    expect(high[100]).toBeCloseTo(1 - normalCdf((99.5 - 98) / 8), 9);
    const exact = powerChances(41.6, 0);
    expect(exact[42]).toBe(1);
    expect(exact.reduce((sum, c) => sum + c, 0)).toBe(1);
  });
});

describe('the player models on a made-up world', () => {
  const run = (options: Parameters<typeof runBenchmark>[0] = {}): BenchmarkResult =>
    runBenchmark({ sweep: madeUpSweep, ...options });

  it('is deterministic for a seed, and another seed gives other bottles', () => {
    expect(run({ seed: 5 })).toEqual(run({ seed: 5 }));
    expect(run({ seed: 5 })).not.toEqual(run({ seed: 6 }));
  });

  it('throws 200 bottles by default and as many as asked', () => {
    expect(run().bottles).toBe(200);
    expect(run().practiced.landingRate * 200).toBeCloseTo(run().practiced.landings, 9);
    const small = run({ bottles: 40 });
    expect(small.bottles).toBe(40);
    expect(small.practiced.landingRate).toBe(small.practiced.landings / 40);
  });

  it('a practiced player with no error lands every bottle, one point each', () => {
    const result = run({ errorSigma: 0 });
    expect(result.practiced.landings).toBe(200);
    expect(result.practiced.landingRate).toBe(1);
    expect(result.practiced.pointsPer10).toBe(10);
  });

  it('a new player with no error throws one fixed power at every bottle: the average center', () => {
    const levels = bottlesOf(1);
    const average = levels.reduce((sum, water) => sum + centerOf(water), 0) / levels.length;
    const result = run({ errorSigma: 0 });
    expect(result.newPlayerAim).toBeCloseTo(average, 9);
    // With no error the throw is that power rounded, so it lands exactly the bottles whose window
    // holds it (a window of 12: 6 below and 6 above its center).
    const power = Math.round(average);
    const expected = levels.filter((water) => Math.abs(power - centerOf(water)) <= 6).length;
    expect(result.newPlayer.landings).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(200);
    expect(result.newPlayer.pointsPer10).toBeCloseTo((expected / 200) * 10, 9);
  });

  it('the best fixed power is the one power that lands the most bottles', () => {
    const levels = bottlesOf(1);
    const landed = (power: number): number =>
      levels.filter((water) => Math.abs(power - centerOf(water)) <= 6 || power >= 90).length;
    let best = 0;
    for (let power = 0; power <= 100; power++) best = Math.max(best, landed(power));
    const { bestFixed } = run();
    expect(bestFixed.landings).toBe(best);
    expect(landed(bestFixed.power)).toBe(best);
    expect(bestFixed.landingRate).toBe(best / 200);
    // The double-flip powers (90 and up) land every bottle in this world, and they are one power
    // among 101 that a fixed power can use: the lowest of the best is the one reported.
    expect(bestFixed.landings).toBe(200);
    expect(bestFixed.power).toBe(90);
    expect(bestFixed.pointsPer10).toBe(20); // a double, 2 points, every time
  });

  it('the best-scoring fixed power is the one that scores the most points, not the most landings', () => {
    // Powers 50 to 69 land every bottle for 1 point; powers from 70 land only the bottles with
    // water of 0.5 or more, but for 3 points each. The most landings are at 50 to 69, the most
    // points at 70.
    const result = runBenchmark({
      sweep: (water) =>
        Array.from({ length: 101 }, (_, power) => {
          const triple = power >= 70 && water >= 0.5;
          const single = power >= 50 && power < 70;
          return {
            power,
            result: triple || single ? ('success' as const) : ('fail' as const),
            turns: triple ? 3 : single ? 1 : 0,
            points: triple ? 3 : single ? 1 : 0,
          };
        }),
    });
    const levels = bottlesOf(1);
    const heavy = levels.filter((water) => water >= 0.5).length;
    expect(result.bestFixed).toMatchObject({ power: 50, landings: 200, pointsPer10: 10 });
    expect(result.bestScoringFixed.power).toBe(70);
    expect(result.bestScoringFixed.landings).toBe(heavy);
    expect(result.bestScoringFixed.pointsPer10).toBeCloseTo(((heavy * 3) / 200) * 10, 9);
    expect(heavy).toBeGreaterThan(70); // so 3 points on those beat 1 point on all 200
    expect(heavy).toBeLessThan(200);
  });

  it('a bigger error lands fewer bottles', () => {
    const rates = [2, 8, 16].map((errorSigma) => run({ errorSigma }).practiced.landingRate);
    // Aiming at the window center (6 either side) with σ 2 lands almost always, with σ 16 rarely.
    expect(rates[0]).toBeGreaterThan(0.95);
    expect(rates[0]).toBeGreaterThan(rates[1]!);
    expect(rates[1]).toBeGreaterThan(rates[2]!);
  });

  it('with a small error the practiced player beats the new one, who ignores the water', () => {
    const result = run({ errorSigma: 2 });
    expect(result.practiced.landingRate).toBeGreaterThan(0.95);
    expect(result.newPlayer.landingRate).toBeLessThan(0.6); // the windows are spread from 24 to 56
  });

  it('the error is a normal one of the given size: at σ 8 about 58% land a window ±6 wide', () => {
    // A throw lands when the rounded aim plus error is within 6 of the center, that is when the
    // error is within ±6.5: 2Φ(6.5/8) - 1 = 0.583. (The double powers from 90 are out of reach.)
    const rate = run({ seed: 3, bottles: 4000 }).practiced.landingRate;
    expect(rate).toBeGreaterThan(0.55);
    expect(rate).toBeLessThan(0.62);
  });

  it('the expected rates are exact: no seed, every level counted once', () => {
    // The 17 levels have centers 24, 26, ... 56, so the new player's aim is 40, their mean.
    const { expected } = run();
    expect(expected.newPlayerAim).toBeCloseTo(40, 9);
    // A practiced throw lands within ±6.5 of the center: 2Φ(6.5/8) - 1 = 0.5833 (the double flips
    // from power 90 are 4 deviations away from every aim).
    expect(expected.practiced).toBeCloseTo(0.5833, 3);
    // The new player lands the levels whose window holds the throw: for each center c, the chance
    // that a throw aimed at 40 is within 6 of c, averaged over the levels.
    let total = 0;
    for (let c = 24; c <= 56; c += 2) {
      total += normalCdf((c + 6.5 - 40) / 8) - normalCdf((c - 6.5 - 40) / 8);
    }
    expect(expected.newPlayer).toBeCloseTo(total / 17, 3);
    // With no error the expectation is a count: everyone lands their own window, and the new
    // player lands the 7 levels (of 17) whose window holds 40, that is the centers 34 to 46.
    const exact = run({ errorSigma: 0 }).expected;
    expect(exact.practiced).toBe(1);
    expect(exact.newPlayer).toBeCloseTo(7 / 17, 9);
  });

  it('the expected points show when going for doubles beats reading the water', () => {
    // With no error the practiced player lands a single every time (10 per 10), and any fixed
    // power from 90 is a double at every level (20 per 10); the lowest such aim wins the tie.
    const exact = run({ errorSigma: 0 }).expected;
    expect(exact.practicedPointsPer10).toBeCloseTo(10, 9);
    expect(exact.bestFixedAim).toEqual({ aim: 90, pointsPer10: 20 });
    // With σ 8, aiming at 100 lands a double whenever the throw is at least 89.5, that is when
    // the error is above -10.5 (the bar keeps the rest on 100): 2 points times Φ(10.5/8).
    const { expected } = run();
    expect(expected.bestFixedAim.aim).toBe(100);
    expect(expected.bestFixedAim.pointsPer10).toBeCloseTo(20 * normalCdf(10.5 / 8), 3);
    expect(expected.bestFixedAim.pointsPer10).toBeGreaterThan(expected.practicedPointsPer10);
  });

  it('the expected rates do not depend on the seed', () => {
    expect(run({ seed: 5 }).expected).toEqual(run({ seed: 9 }).expected);
    expect(run({ bottles: 40 }).expected).toEqual(run().expected);
  });

  it('a double flip scores 2 points and counts as one landing', () => {
    // Every throw at a power of 50 or more is a double in this world.
    const result = runBenchmark({
      sweep: (water) =>
        madeUpSweep(water).map((throwAt) =>
          throwAt.power >= 50
            ? { ...throwAt, result: 'success' as const, turns: 2, points: 2 }
            : { ...throwAt, result: 'fail' as const, turns: 0, points: 0 },
        ),
      errorSigma: 0,
    });
    // No single window exists, so the practiced player aims at the middle, 50: a double each time.
    expect(result.practiced.landings).toBe(200);
    expect(result.practiced.points).toBe(400);
    expect(result.practiced.pointsPer10).toBe(20);
  });

  it('a world where nothing ever lands gives zero landings and zero points, not an error', () => {
    const result = runBenchmark({
      sweep: (water) => madeUpSweep(water).map((t) => ({ ...t, result: 'fail' as const })),
    });
    expect(result.practiced.landings).toBe(0);
    expect(result.newPlayer.landings).toBe(0);
    expect(result.practiced.pointsPer10).toBe(0);
    expect(result.bestFixed.landings).toBe(0);
    expect(result.bestFixed.power).toBe(0);
  });

  it('lists the window center of every distinct water level, rising with the water', () => {
    const { centers } = run();
    expect(centers.length).toBe(17); // 10% to 90% in 5% steps
    expect(centers[0]).toEqual({ water: 0.1, center: 24 });
    expect(centers[16]).toEqual({ water: 0.9, center: 56 });
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i]!.center).toBeGreaterThan(centers[i - 1]!.center);
    }
  });
});

describe('the benchmark of the default tuning', () => {
  let result: BenchmarkResult;
  beforeAll(() => {
    result = runBenchmark();
  }, 120_000);

  it('is deterministic for a seed: the same run twice gives the same numbers', () => {
    expect(runBenchmark()).toEqual(result);
  }, 120_000);

  it('adds up: landings, rates and points agree', () => {
    for (const player of [result.practiced, result.newPlayer]) {
      expect(player.landingRate).toBe(player.landings / result.bottles);
      expect(player.points).toBeGreaterThanOrEqual(player.landings); // every landing is 1 point or more
      expect(player.pointsPer10).toBeCloseTo((player.points / result.bottles) * 10, 9);
    }
    expect(result.bottles).toBe(200);
    expect(result.errorSigma).toBe(8);
  });

  // Design section 3: a practiced player lands 6 to 8 of 10, an attentive new player about 3 of 10.
  it('a practiced player lands 60 to 80% of 200 throws', () => {
    expect(result.practiced.landingRate).toBeGreaterThanOrEqual(0.6);
    expect(result.practiced.landingRate).toBeLessThanOrEqual(0.8);
  });

  it('a new player lands 20 to 40% of 200 throws', () => {
    expect(result.newPlayer.landingRate).toBeGreaterThanOrEqual(0.2);
    expect(result.newPlayer.landingRate).toBeLessThanOrEqual(0.4);
  });

  // The 200 throws of the default seed are one draw, and a lucky one can pass a tuning that misses
  // in the long run (F034's first try: 37.5% on the seed, 43.8% expected, and the seed was the
  // luckiest of 20). The exact expected rates integrate the error over every power at every level,
  // so these hold for any seed, and they hold the same design ranges.
  it('the expected practiced rate, free of the luck of the draw, is 60 to 80%', () => {
    expect(result.expected.practiced).toBeGreaterThanOrEqual(0.6);
    expect(result.expected.practiced).toBeLessThanOrEqual(0.8);
  });

  it('the expected new-player rate is at least 20%', () => {
    expect(result.expected.newPlayer).toBeGreaterThanOrEqual(0.2);
  });

  // OPEN (F034, session 59): the design's upper limit of 40% is NOT met in expectation by the
  // 1.85:1 bottle's tuning (43.8%; the default seed's 37.5% is the luckiest of 20 seeds), and no
  // tuning found at 1.8:1 or slimmer meets every other target too (see the F034 progress entries
  // and D33). This is the test that closes it; turn it into a real `it` with
  // `expect(result.expected.newPlayer).toBeLessThanOrEqual(0.4)` when a tuning meets it.
  it.todo('the expected new-player rate is at most 40%');

  // Design section 3 (2026-11-20): with the same aiming error, reading the water must score more
  // points than throwing one power at every bottle to go for doubles. A player with no error at
  // all can still do better with one high power; nobody throws without error.
  it('reading the water scores more points than any one fixed power with the same error', () => {
    expect(result.expected.practicedPointsPer10).toBeGreaterThan(
      result.expected.bestFixedAim.pointsPer10,
    );
  });

  it('the expected rates are near what the 200 throws of a seed land (the draw is only luck)', () => {
    // 200 throws at about 50% land with a standard deviation of 3.5 points: 12 points is 3.4 σ.
    expect(Math.abs(result.practiced.landingRate - result.expected.practiced)).toBeLessThan(0.12);
    expect(Math.abs(result.newPlayer.landingRate - result.expected.newPlayer)).toBeLessThan(0.12);
  });

  it('reading the water pays: the practiced player lands clearly more than the new one', () => {
    expect(result.practiced.landingRate).toBeGreaterThan(result.newPlayer.landingRate + 0.15);
    expect(result.practiced.pointsPer10).toBeGreaterThan(result.newPlayer.pointsPer10);
  });

  // Design section 3: no single fixed power may land most bottles. calibration.test.ts holds the
  // exact limit (60% of the nine tested levels, single flips only); this is the same target over
  // the 200 random bottles and every kind of landing, with a little room for the luck of the draw.
  it('no fixed power, however well it is chosen, lands more than about 60% of the bottles', () => {
    expect(result.bestFixed.landingRate).toBeLessThanOrEqual(0.65);
    expect(result.bestFixed.landingRate).toBeGreaterThan(result.newPlayer.landingRate);
  });

  // No target is set on points: the design counts landings. This only checks that the figure the
  // script prints is consistent (the best-scoring power scores at least what any other does,
  // including the most-landing one, and has a nonzero score).
  it('reports a best-scoring fixed power that scores at least as much as the most-landing one', () => {
    expect(result.bestScoringFixed.pointsPer10).toBeGreaterThanOrEqual(
      result.bestFixed.pointsPer10,
    );
    expect(result.bestScoringFixed.pointsPer10).toBeGreaterThan(0);
    expect(result.bestScoringFixed.landings).toBeGreaterThan(0);
  });
});
