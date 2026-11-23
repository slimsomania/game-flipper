import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { findWindows, sweepPowers, widestWindow } from '../src/core/flipWindow';
import { runBenchmark } from '../src/core/difficulty';
import { DEFAULT_TUNING, type Tuning } from '../src/core/tuning';

const KEYS = [
  'shellDensity',
  'sloshFrequency',
  'sloshDamping',
  'bottleFriction',
  'bottleRestitution',
  'bottleAngularDamping',
  'bottleLinearDamping',
  'throwLinearImpulse',
  'throwAngularImpulse',
  'throwSpinExponent',
  'throwSpinGrowth',
] as const;
const LEVELS = Array.from({ length: 17 }, (_, i) => Math.round((0.1 + 0.05 * i) * 1e6) / 1e6);

export function score(t: Partial<Tuning>) {
  let pen = 0;
  const sweeps = new Map<number, any[]>();
  const sing: any[] = [];
  const dbl: any[] = [];
  for (const w of LEVELS) {
    const pts = sweepPowers(w, t);
    sweeps.set(w, pts);
    const ws = findWindows(pts);
    sing.push(widestWindow(ws, 1));
    dbl.push(widestWindow(ws, 2));
  }
  const miss = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0);
  for (let i = 0; i < 17; i++) {
    const s = sing[i];
    const d = dbl[i];
    if (!s) {
      pen += 200;
      continue;
    }
    pen += 10 * miss(s.width, 12, 26);
    if (i > 0 && sing[i - 1]) pen += 10 * Math.max(0, 1.0 - (s.center - sing[i - 1].center));
    if (!d) {
      pen += 100;
      continue;
    }
    pen += 10 * Math.max(0, 5 - d.width);
    pen += 10 * Math.max(0, d.width - (s.width - 3));
    pen += 6 * Math.max(0, d.width - 7);
    pen += 10 * Math.max(0, d.low - 97);
    pen += 10 * Math.max(0, s.high + 3 - d.low);
  }
  if (sing[0] && sing[16]) {
    pen += 100 * miss(sing[16].center / sing[0].center, 2.6, 3.9);
    if (sing[0].high + 1 >= sing[16].low) pen += 100;
  }
  let worst = 0;
  let worstAny = 0;
  for (let p = 0; p <= 100; p++) {
    let a = 0;
    let b = 0;
    for (const w of LEVELS) {
      const pt = sweeps.get(w)![p];
      if (pt.result === 'success') {
        b++;
        if (pt.turns === 1) a++;
      }
    }
    worst = Math.max(worst, a / 17);
    worstAny = Math.max(worstAny, b / 17);
  }
  pen += 300 * Math.max(0, worst - 0.5) + 300 * Math.max(0, worstAny - 0.5);
  const r = runBenchmark({ tuning: t, sweep: (w) => sweeps.get(w) ?? sweepPowers(w, t) });
  const e = r.expected;
  pen += 300 * miss(e.practiced, 0.63, 0.77) + 300 * miss(e.newPlayer, 0.25, 0.42);
  pen += 100 * Math.max(0, e.bestFixedAim.pointsPer10 - (e.practicedPointsPer10 - 0.8));
  pen += 300 * Math.max(0, r.bestFixed.landingRate - 0.58);
  const summary = `pen ${pen.toFixed(1)} single ${sing.map((s) => (s ? s.width : '-')).join(',')} dbl ${dbl
    .map((s) => (s ? s.low + '-' + s.high : '-'))
    .join(
      ' ',
    )} prac ${(e.practiced * 100).toFixed(1)} new ${(e.newPlayer * 100).toFixed(1)} fix ${worst.toFixed(2)}/${worstAny.toFixed(2)} bf ${r.bestFixed.landingRate} pts ${e.practicedPointsPer10.toFixed(2)}/${e.bestFixedAim.pointsPer10.toFixed(2)}`;
  return { pen, summary };
}

if (process.argv[2]) {
  const id = process.argv[2];
  const minutes = Number(process.argv[3] || 20);
  let seed = Number(id) * 7919 + 1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const gauss = () => {
    let u = 0;
    for (let i = 0; i < 6; i++) u += rnd();
    return (u - 3) / Math.sqrt(0.5);
  };
  const file = `coverage/best-${id}.json`;
  let cur: any = { ...DEFAULT_TUNING };
  const start = process.argv[4];
  if (start && existsSync(start)) cur = { ...cur, ...JSON.parse(readFileSync(start, 'utf8')) };
  let best = score(cur);
  console.log('start', best.summary);
  const end = Date.now() + minutes * 60000;
  let it = 0;
  let sigma = 0.03;
  while (Date.now() < end) {
    it++;
    const cand: any = { ...cur };
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const key = KEYS[Math.floor(rnd() * KEYS.length)]!;
      cand[key] = cur[key] * (1 + sigma * gauss());
    }
    cand.bottleRestitution = Math.max(0, cand.bottleRestitution);
    let s;
    try {
      s = score(cand);
    } catch {
      continue;
    }
    if (s.pen < best.pen) {
      best = s;
      cur = cand;
      writeFileSync(file, JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, cur[k]]))));
      console.log(it, s.summary);
    }
    if (it % 40 === 0) sigma = sigma > 0.01 ? sigma * 0.9 : 0.03;
  }
}
