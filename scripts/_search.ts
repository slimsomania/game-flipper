import { appendFileSync, writeFileSync } from 'node:fs';
import { findWindows, sweepPowers, widestWindow, type SweepPoint } from '../src/core/flipWindow';
import { createRng } from '../src/core/rng';
import { resolveTuning, type Tuning } from '../src/core/tuning';
import { riseAt } from './_rise';

const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const LEVELS17 = Array.from({ length: 17 }, (_, i) => Math.round((0.1 + i * 0.05) * 1e6) / 1e6);
const SIGMA = 8;

const erf = (x: number): number => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const cdf = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));

/** Chance that a player aiming at `aim` lands, given success flags per power. */
function expectedRate(aim: number, ok: boolean[]): number {
  let total = 0;
  for (let p = 0; p <= 100; p++) {
    const lo = p === 0 ? -Infinity : (p - 0.5 - aim) / SIGMA;
    const hi = p === 100 ? Infinity : (p + 0.5 - aim) / SIGMA;
    if (ok[p]) total += cdf(hi) - cdf(lo);
  }
  return total;
}

export interface Metrics {
  score: number;
  text: string;
}

export function evaluate(over: Partial<Tuning>): Metrics {
  const tuning = resolveTuning(over);
  const pts17: SweepPoint[][] = LEVELS17.map((w) => sweepPowers(w, tuning));
  const pts: SweepPoint[][] = [0, 2, 4, 6, 8, 10, 12, 14, 16].map((i) => pts17[i]!);
  const singles17 = pts17.map((p) => widestWindow(findWindows(p), 1));
  if (singles17.some((s) => !s)) return { score: 1e6, text: 'missing single window (17)' };
  const wins = pts.map((p) => findWindows(p));
  const singles = wins.map((w) => widestWindow(w, 1));
  const doubles = wins.map((w) => widestWindow(w, 2));
  let score = 0;
  const pen = (violation: number, weight = 1): void => {
    if (violation > 0) score += weight * violation * violation;
  };
  if (singles.some((s) => !s)) return { score: 1e6, text: 'missing single window' };
  const centers = singles.map((s) => s!.center);
  const widths = singles.map((s) => s!.width);
  const ratio = centers[8]! / centers[0]!;
  pen(2.7 - ratio, 20);
  pen(ratio - 3.8, 20);
  for (const w of widths) {
    pen(11 - w, 2);
    pen(w - 26, 2);
  }
  for (let i = 1; i < 9; i++) pen(centers[i - 1]! + 2 - centers[i]!, 5);
  // doubles: want each to exist with its low edge under 96 so the window is reachable in full.
  for (let i = 0; i < 9; i++) {
    const d = doubles[i];
    if (!d) {
      score += 400;
      continue;
    }
    pen(d.high - 99, 1);
    pen(d.low - 95, 1);
    pen(5 - d.width, 2);
    pen(d.low - singles[i]!.high - 1 > 0 ? 0 : 1, 100);
  }
  // fixed-power coverage of single windows over the 9 levels: at most 5 of 9.
  let bestCover = 0;
  for (let p = 0; p <= 100; p++) {
    const n = singles.filter((s) => p >= s!.low && p <= s!.high).length;
    bestCover = Math.max(bestCover, n);
  }
  pen(bestCover - 5, 50);
  // expected landing rates (any success), 9 levels equally weighted.
  const oks = pts17.map((p) => p.map((q) => q.result === 'success'));
  const centers17 = singles17.map((s) => s!.center);
  const prac = oks.reduce((s, ok, i) => s + expectedRate(centers17[i]!, ok), 0) / 17;
  const aim = centers17.reduce((s, c) => s + c, 0) / 17;
  const neu = oks.reduce((s, ok) => s + expectedRate(aim, ok), 0) / 17;
  let bestFixed = 0;
  for (let p = 0; p <= 100; p++) {
    bestFixed = Math.max(bestFixed, oks.filter((o) => o[p]).length / 17);
  }
  pen((0.27 - neu) * 100, 3);
  pen((neu - 0.35) * 100, 3);
  pen((0.67 - prac) * 100, 3);
  pen((prac - 0.76) * 100, 3);
  pen((bestFixed - 0.58) * 100, 2);
  // flight: base apex above the hand at three window centers; want at least 1.25 m.
  // The visible rise: how far the highest point of the bottle goes above the held bottle's top
  // (F009's tuning: 0.44 to 0.49 m at every level). Want at least 0.45 m.
  const apexes: number[] = [];
  for (const i of [0, 4, 8]) {
    apexes.push(riseAt(LEVELS[i]!, Math.round(centers[i]!), tuning).rise);
  }
  for (const a of apexes) pen((0.45 - a) * 10, 3);
  const text = `score ${score.toFixed(2)} ratio ${ratio.toFixed(2)} centers ${centers[0]}-${centers[8]} widths ${Math.min(...widths)}-${Math.max(...widths)} cover ${bestCover}/9 prac ${prac.toFixed(3)} new ${neu.toFixed(3)} bestFixed ${bestFixed.toFixed(2)} doubleLow ${Math.max(...doubles.map((d) => d?.low ?? 999))} doubleHigh ${Math.max(...doubles.map((d) => d?.high ?? 999))} apex ${apexes.map((a) => a.toFixed(2)).join('/')}`;
  return { score, text };
}

// ---- the search ----
const RANGES: Partial<Record<keyof Tuning, [number, number, number]>> = {
  // [min, max, step as a fraction of the range]
  shellDensity: [0.15, 1.1, 0.04],
  throwLinearImpulse: [2, 12, 0.03],
  throwAngularImpulse: [2, 9, 0.04],
  throwSpinGrowth: [0.008, 0.026, 0.04],
  throwSpinExponent: [0.01, 0.2, 0.02],
  bottleAngularDamping: [1.5, 4.5, 0.04],
  bottleFriction: [0.5, 1.0, 0.03],
  bottleRestitution: [0, 0.12, 0.03],
  bottleLinearDamping: [0.1, 0.7, 0.03],
  throwAngleDeg: [2, 12, 0.03],
};

if (process.argv[1]?.includes('_search')) {
  const seed = Number(process.argv[2] ?? 1);
  const iterations = Number(process.argv[3] ?? 200);
  const out = process.argv[4] ?? `search-${seed}.log`;
  const start: Partial<Tuning> = JSON.parse(process.argv[5] ?? '{}');
  const rng = createRng(seed);
  let current: Partial<Tuning> = { ...start };
  const first = evaluate(current);
  let currentScore = first.score;
  writeFileSync(out, `start ${JSON.stringify(current)} ${first.text}\n`);
  const keys = Object.keys(RANGES) as (keyof Tuning)[];
  for (let it = 0; it < iterations; it++) {
    const candidate: Partial<Tuning> = { ...current };
    // perturb one to three parameters
    const n = 1 + rng.int(0, 2);
    for (let j = 0; j < n; j++) {
      const key = keys[rng.int(0, keys.length - 1)]!;
      const [min, max, step] = RANGES[key]!;
      const value = (candidate[key] ?? resolveTuning({})[key]) as number;
      const u = rng.next() + rng.next() + rng.next() - 1.5; // roughly normal, sd 0.5
      const next = Math.min(max, Math.max(min, value + u * 2 * step * (max - min)));
      (candidate as Record<string, number>)[key] = Math.round(next * 1e4) / 1e4;
    }
    const result = evaluate(candidate);
    if (result.score <= currentScore) {
      current = candidate;
      currentScore = result.score;
      appendFileSync(out, `it ${it} ${JSON.stringify(current)} ${result.text}\n`);
    }
  }
  appendFileSync(out, `done ${JSON.stringify(current)}\n`);
}
