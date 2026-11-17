// THROWAWAY tuning search for F009 (deleted before commit).
// usage: npx tsx scripts/explore-search.ts <seed> <iterations> '<shapeJson>' ['<startJson>']
import * as fs from 'node:fs';
const shapeArg = process.argv[4];
if (shapeArg) process.env.FLIPPER_SHAPE = shapeArg;
const { findWindows, sweepPowers, widestWindow } = await import('../src/core/flipWindow');
const { __setShape } = await import('../src/core/bottleShape');
type SweepPoint = import('../src/core/flipWindow').SweepPoint;
type Tuning = import('../src/core/tuning').Tuning;
const log = (s: string): void => {
  fs.writeSync(1, `${s}\n`);
};
const SHAPE_KEYS = ['bodyW', 'bodyH', 'shoulderH', 'neckH', 'capH', 'neckW', 'capW'];

const LEVELS = [0.1, 0.3, 0.5, 0.7, 0.9];
// Cheapest way to reject a candidate first: the middle and the top level.
const ORDER = [2, 4, 0, 1, 3];
const TWO_PI = Math.PI * 2;

type Params = Record<string, number>;
interface Range {
  key: string;
  lo: number;
  hi: number;
  log?: boolean;
}
const RANGES: Range[] = [
  { key: 'throwLinearImpulse', lo: 5, hi: 12, log: true },
  { key: 'throwAngularImpulse', lo: 0.5, hi: 12, log: true },
  { key: 'throwAngleDeg', lo: 0, hi: 10 },
  { key: 'shellDensity', lo: 0.05, hi: 0.8, log: true },
  { key: 'bottleFriction', lo: 0.1, hi: 2, log: true },
  { key: 'bottleRestitution', lo: 0, hi: 0.4 },
  { key: 'bottleAngularDamping', lo: 0, hi: 6 },
  { key: 'bottleLinearDamping', lo: 0, hi: 0.6 },
  { key: 'bodyW', lo: 0.7, hi: 1.3 },
  { key: 'bodyH', lo: 0.35, hi: 1.1 },
  { key: 'shoulderH', lo: 0.08, hi: 0.35 },
  { key: 'neckH', lo: 0.05, hi: 0.2 },
  { key: 'capH', lo: 0.05, hi: 0.15 },
  { key: 'neckW', lo: 0.2, hi: 0.4 },
  { key: 'capW', lo: 0.25, hi: 0.45 },
];

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Report {
  penalty: number;
  lines: string[];
}

function evaluate(allParams: Params, cutoff = Infinity): Report {
  const shape: Record<string, number> = {};
  const tuning: Record<string, number> = {};
  for (const [k, v] of Object.entries(allParams)) (SHAPE_KEYS.includes(k) ? shape : tuning)[k] = v;
  __setShape(shape);
  const params = tuning as Partial<Tuning>;
  let penalty = 0;
  const lines: string[] = [];
  const centers: number[] = [NaN, NaN, NaN, NaN, NaN];
  const singles: ({ low: number; high: number } | null)[] = [null, null, null, null, null];
  for (const idx of ORDER) {
    const water = LEVELS[idx]!;
    const pts: SweepPoint[] = sweepPowers(water, params);
    const wins = findWindows(pts);
    const w1 = widestWindow(wins, 1);
    const w2 = widestWindow(wins, 2);
    const n1 = pts.filter((p) => p.result === 'success' && p.turns === 1).length;
    const n2 = pts.filter((p) => p.result === 'success' && p.turns === 2).length;
    singles[idx] = w1;
    let note = `${water}: `;
    if (!w1) {
      penalty += 30 + Math.max(0, 12 - n1) * 1.5;
      note += `single none(n${n1})`;
    } else {
      note += `s ${w1.low}-${w1.high} w${w1.width}`;
      centers[idx] = w1.center;
      if (w1.width < 14) penalty += (14 - w1.width) * 1.5;
      if (w1.width > 26) penalty += (w1.width - 26) * 1.5;
      const below = pts[w1.low - 10];
      if (below && below.rotation >= TWO_PI) penalty += 8;
      const above = pts[w1.high + 10];
      if (above && above.rotation <= TWO_PI) penalty += 8;
    }
    if (!w2) {
      penalty += 15 + Math.max(0, 5 - n2) * 3;
      note += ` double none(n${n2})`;
    } else {
      note += ` d ${w2.low}-${w2.high} w${w2.width}`;
      if (w2.width < 5) penalty += (5 - w2.width) * 3;
      if (w1) {
        if (w2.width >= w1.width) penalty += 10 + (w2.width - w1.width);
        if (w2.low <= w1.high) penalty += 15;
      }
    }
    lines.push(note);
    if (penalty > cutoff) return { penalty: Infinity, lines };
  }
  for (let i = 1; i < centers.length; i++) {
    if (!(centers[i]! > centers[i - 1]!)) penalty += 10;
  }
  const ratio = centers[4]! / centers[0]!;
  lines.push(`ratio ${ratio.toFixed(2)}`);
  if (Number.isNaN(ratio)) penalty += 10;
  else {
    if (ratio < 1.55) penalty += (1.55 - ratio) * 40;
    if (ratio > 1.95) penalty += (ratio - 1.95) * 40;
  }
  const a = singles[0];
  const b = singles[4];
  if (a && b && !(a.high < b.low)) penalty += 10 + (a.high - b.low);
  return { penalty, lines };
}

function sample(rng: () => number): Params {
  const p: Record<string, number> = {};
  for (const r of RANGES) {
    const u = rng();
    p[r.key] = r.log
      ? Math.exp(Math.log(r.lo) + u * (Math.log(r.hi) - Math.log(r.lo)))
      : r.lo + u * (r.hi - r.lo);
  }
  return p as Params;
}

function perturb(base: Params, rng: () => number, scale: number): Params {
  const p: Record<string, number> = { ...(base as Record<string, number>) };
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = RANGES[Math.floor(rng() * RANGES.length)]!;
    const cur = p[r.key]!;
    const g = (rng() + rng() + rng() - 1.5) * 2;
    const next = r.log ? cur * Math.exp(g * scale) : cur + g * scale * (r.hi - r.lo) * 0.5;
    p[r.key] = Math.min(r.hi, Math.max(r.lo, next));
  }
  return p as Params;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;
const show = (p: Params): string =>
  JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, round(v as number)])));

const seed = Number(process.argv[2] ?? 1);
const iterations = Number(process.argv[3] ?? 200);
const rng = mulberry32(seed);
let best: Params;
let bestReport: Report;
if (process.argv[5]) {
  const shapeDefaults: Params = {
    bodyW: 1.0,
    bodyH: 0.8,
    shoulderH: 0.2,
    neckH: 0.1,
    capH: 0.1,
    neckW: 0.3,
    capW: 0.36,
  };
  best = { ...shapeDefaults, ...JSON.parse(process.argv[5]) };
  bestReport = evaluate(best);
} else {
  best = sample(rng);
  bestReport = evaluate(best);
  for (let i = 0; i < 150; i++) {
    const c = sample(rng);
    const r = evaluate(c, bestReport.penalty);
    if (r.penalty < bestReport.penalty) {
      best = c;
      bestReport = r;
    }
  }
}
log(`seed ${seed} start penalty ${bestReport.penalty.toFixed(1)} ${show(best)}`);
for (let i = 0; i < iterations; i++) {
  const scale = 0.2 * (1 - i / iterations) + 0.03;
  const c = perturb(best, rng, scale);
  const r = evaluate(c, bestReport.penalty);
  if (r.penalty <= bestReport.penalty) {
    if (r.penalty < bestReport.penalty) {
      log(`iter ${i} penalty ${r.penalty.toFixed(1)} ${show(c)}`);
      log(r.lines.join(' | '));
    }
    best = c;
    bestReport = r;
    if (r.penalty === 0) break;
  }
}
log(`RESULT ${show(best)}`);
log(`final penalty ${bestReport.penalty.toFixed(1)}`);
log(bestReport.lines.join('\n'));
