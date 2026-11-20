/* SCRATCH (not committed): scores a tuning with exact expected rates, on the 9 levels. */
import { findWindows, sweepPowers, widestWindow, type FlipWindow, type SweepPoint } from './core/flipWindow';
import { HAND_Y } from './core/bottle';
import { bottleExtent } from './core/outcome';
import { Simulation } from './core/simulation';
import { TABLE_LEFT_X, TABLE_RIGHT_X } from './core/table';
import { DEFAULT_TUNING, type Tuning } from './core/tuning';

export const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
// The 17-level draw (uniform) expressed on the 9 nodes: odd levels are the mean of their neighbors.
const WEIGHTS = [1.5, 2, 2, 2, 2, 2, 2, 2, 1.5].map((w) => w / 17);
const SIGMA = 8;

function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}
const phi = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));

/** P(thrown power = k) for k in 0..100 when aiming at `aim` with a normal error, rounded, clamped. */
function powerDist(aim: number): number[] {
  const out: number[] = [];
  for (let k = 0; k <= 100; k++) {
    const lo = k === 0 ? -Infinity : (k - 0.5 - aim) / SIGMA;
    const hi = k === 100 ? Infinity : (k + 0.5 - aim) / SIGMA;
    out.push(phi(hi) - phi(lo));
  }
  return out;
}

export interface Detail {
  singles: (FlipWindow | null)[];
  doubles: (FlipWindow | null)[];
  practiced: number;
  newPlayer: number;
  newAim: number;
  bestFixed: number;
  bestFixedPower: number;
  singleShare: number; // most levels (of 9) one power lands a single flip on
  ratio: number;
  flight: { rise: number; x: number; top: number; left: number; right: number; ok: boolean }[];
  notes: string[];
}

function fly(water: number, power: number, tuning: Partial<Tuning>) {
  const sim = new Simulation({ seed: 1, tuning });
  sim.setWater(water);
  sim.throwBottle(power);
  let highest = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let rise = 0;
  for (let i = 0; i < 400 && sim.phase === 'flying'; i++) {
    sim.step();
    const { x, y, angle } = sim.snapshot().bottle;
    const box = bottleExtent(x, y, angle);
    highest = Math.min(highest, box.minY);
    left = Math.min(left, box.minX);
    right = Math.max(right, box.maxX);
    rise = Math.max(rise, HAND_Y - y);
  }
  const s = sim.snapshot();
  const ok =
    s.outcome?.result === 'success' && s.bottle.x > TABLE_LEFT_X && s.bottle.x < TABLE_RIGHT_X;
  return { rise, x: s.bottle.x, top: highest, left, right, ok };
}

export function evaluate(tuning: Partial<Tuning>): { cost: number; detail: Detail } {
  const notes: string[] = [];
  let cost = 0;
  const add = (w: number, v: number, label: string): void => {
    if (v > 0) {
      cost += w * v * v;
      notes.push(`${label}:${v.toFixed(2)}`);
    }
  };
  const lo = (v: number, target: number, scale: number): number => Math.max(0, (target - v) / scale);
  const hi = (v: number, target: number, scale: number): number => Math.max(0, (v - target) / scale);

  const sweeps: SweepPoint[][] = LEVELS.map((w) => sweepPowers(w, tuning));
  const windows = sweeps.map((points) => findWindows(points));
  const singles = windows.map((w) => widestWindow(w, 1));
  const doubles = windows.map((w) => widestWindow(w, 2));

  // Single and double windows.
  singles.forEach((s, i) => {
    const l = `${Math.round(LEVELS[i]! * 100)}%`;
    if (!s) {
      add(1, 10, `single missing ${l}`);
      return;
    }
    add(20, lo(s.width, 10.5, 1), `single narrow ${l}`);
    add(1, hi(s.width, 24, 4), `single wide ${l}`);
    const d = doubles[i];
    if (!d) {
      add(1, 10, `double missing ${l}`);
      return;
    }
    add(10, lo(d.width, 4.5, 1), `double narrow ${l}`);
    add(10, hi(d.low, 95.5, 1), `double high ${l}`);
    add(10, hi(d.width, s.width - 1, 1), `double wider than single ${l}`);
    add(5, lo(d.low - s.high, 2, 2), `double touching single ${l}`);
  });

  const centers = singles.map((s) => (s ? s.center : NaN));
  for (let i = 1; i < centers.length; i++) {
    if (!(centers[i]! - centers[i - 1]! >= 2)) add(10, lo(centers[i]! - centers[i - 1]!, 2, 1) || 1, `centers ${i}`);
  }
  const ratio = centers[8]! / centers[0]!;
  add(10, lo(ratio, 2.6, 0.1), 'ratio low');
  add(10, hi(ratio, 3.95, 0.1), 'ratio high');
  if (singles[0] && singles[8]) add(5, lo(singles[8].low - singles[0].high, 3, 3), 'overlap 10/90');

  // Rotation before and after each single window.
  singles.forEach((s, i) => {
    if (!s) return;
    if (s.low - 10 >= 0 && !(sweeps[i]![s.low - 10]!.rotation < 2 * Math.PI)) add(10, 1, `under-rotate ${i}`);
    if (s.high + 10 <= 100 && !(sweeps[i]![s.high + 10]!.rotation > 2 * Math.PI)) add(10, 1, `over-rotate ${i}`);
  });

  // Fixed power: single flips on the 9 levels, and exact expected landings over the draw.
  let singleShare = 0;
  let bestFixed = 0;
  let bestFixedPower = 0;
  for (let p = 0; p <= 100; p++) {
    let single = 0;
    let weighted = 0;
    sweeps.forEach((points, i) => {
      const r = points[p]!;
      if (r.result === 'success') weighted += WEIGHTS[i]!;
      if (r.result === 'success' && r.turns === 1) single++;
    });
    singleShare = Math.max(singleShare, single);
    if (weighted > bestFixed) {
      bestFixed = weighted;
      bestFixedPower = p;
    }
  }
  add(0.5, hi(singleShare, 4, 0.5), `fixed share ${singleShare}/9`);
  add(100, hi(singleShare, 5, 0.5), `fixed share HARD ${singleShare}/9`);
  add(10, hi(bestFixed, 0.60, 0.01), 'best fixed');

  // Expected landing rates of the two models.
  const successAt = (i: number, p: number): number => (sweeps[i]![p]!.result === 'success' ? 1 : 0);
  let practiced = 0;
  singles.forEach((s, i) => {
    const dist = powerDist(s ? s.center : 50);
    let p = 0;
    for (let k = 0; k <= 100; k++) p += dist[k]! * successAt(i, k);
    practiced += WEIGHTS[i]! * p;
  });
  const newAim = singles.reduce((sum, s, i) => sum + WEIGHTS[i]! * (s ? s.center : 50), 0);
  const newDist = powerDist(newAim);
  let newPlayer = 0;
  sweeps.forEach((_, i) => {
    let p = 0;
    for (let k = 0; k <= 100; k++) p += newDist[k]! * successAt(i, k);
    newPlayer += WEIGHTS[i]! * p;
  });
  cost -= 100 * Math.min(practiced, 0.70);
  add(3, lo(practiced, 0.64, 0.01), 'practiced low');
  
  add(3, hi(newPlayer, 0.37, 0.01), 'new high');
  add(1, lo(newPlayer, 0.22, 0.02), 'new low');

  // Flights at the 10%, 50% and 90% single centers, and the 50% double center.
  const flight: Detail['flight'] = [];
  for (const i of [0, 4, 8]) {
    const s = singles[i];
    if (!s) continue;
    const f = fly(LEVELS[i]!, Math.round(s.center), tuning);
    flight.push(f);
    add(20, f.ok ? 0 : 1, `flight fail ${i}`);
    add(5, lo(f.top, 0.3, 0.3), `top ${i}`);
    add(0.5, lo(f.rise, 0.8, 0.2), `rise ${i}`);
    add(0.5, lo(f.x, 3.4, 0.5), `landing x ${i}`);
  }
  const d50 = doubles[4];
  if (d50) {
    const f = fly(0.5, Math.round(d50.center), tuning);
    flight.push(f);
    add(20, f.ok ? 0 : 1, 'flight fail double50');
    add(5, lo(f.top, 0.3, 0.3), 'top double50');
    add(2, hi(f.right, TABLE_RIGHT_X, 1), 'right double50');
  }

  return {
    cost,
    detail: { singles, doubles, practiced, newPlayer, newAim, bestFixed, bestFixedPower, singleShare, ratio, flight, notes },
  };
}

export const START: Tuning = { ...DEFAULT_TUNING };
