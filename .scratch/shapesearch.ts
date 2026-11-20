/* SCRATCH: hill-climb the bottle SHAPE on the landing-band proxy, tuning fixed.
 * Usage: tsx shapesearch.ts name iters tuningFile startShape minRatio */
import { writeFileSync, mkdirSync } from 'node:fs';
import { bands } from './band2';

const [name = 's', itersArg = '100', , , ,] = process.argv.slice(2);
void name;
const iters = Number(itersArg);
const minRatio = Number(process.argv[6] ?? 1.85);
mkdirSync('.scratch/out', { recursive: true });

let seed = Array.from(name).reduce((a, c) => a * 31 + c.charCodeAt(0), 11) >>> 0;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const normal = (): number => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

// bw, bh, sh, nw, nh, cw, ch
const start = (process.argv[5] ?? '0.80,0.95,0.28,0.25,0.12,0.30,0.13').split(',').map(Number);

/** Violation of the plausibility rules, 0 when fine. */
function shapeViolation(s: number[]): number {
  const [bw, bh, sh, nw, nh, cw, ch] = s as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const H = bh + sh + nh + ch;
  let v = 0;
  const hi = (x: number, t: number, sc: number): number => Math.max(0, (x - t) / sc);
  const lo = (x: number, t: number, sc: number): number => Math.max(0, (t - x) / sc);
  v += lo(H / bw, minRatio, 0.05);
  v += lo(nh, 0.11, 0.01);
  v += hi(nw, bw * 0.42, 0.02);
  v += lo(nw, 0.16, 0.01);
  v += lo(cw, nw + 0.03, 0.01);
  v += hi(cw, nw + 0.12, 0.02);
  v += lo(bh / H, 0.5, 0.02) + hi(bh / H, 0.72, 0.02);
  v += lo(sh / H, 0.08, 0.01) + hi(sh / H, 0.26, 0.01);
  v += lo(ch, 0.06, 0.01) + hi(ch, 0.16, 0.01);
  v += hi(H, 1.8, 0.05);
  v += lo(bw, 0.6, 0.02) + hi(bw, 1.05, 0.02);
  return v;
}

function score(s: number[]): { cost: number; text: string } {
  const viol = shapeViolation(s);
  if (viol > 0) return { cost: 1000 + viol, text: 'infeasible' };
  const r = bands(s);
  const mins = Math.min(...r.map((x) => x.band));
  // Prefer a bigger band at the hardest levels, and windows not near 0.
  const cost = -mins - (0.02 * Math.min(...r.map((x) => x.width))) / 10;
  return {
    cost,
    text: r.map((x) => `${x.water}: w${x.width} band ${x.band.toFixed(3)}`).join(' | '),
  };
}

let cur = start;
let { cost: curCost, text } = score(cur);
console.log(name, 'start', curCost.toFixed(4), cur.join(','), text);
let step = 0.05;
let stale = 0;
for (let i = 1; i <= iters; i++) {
  const cand = cur.map((x) => x);
  const n = 1 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const idx = Math.floor(rand() * cand.length);
    cand[idx] = Math.round(cand[idx]! * Math.exp(step * normal()) * 1000) / 1000;
  }
  const res = score(cand);
  if (res.cost <= curCost) {
    if (res.cost < curCost - 1e-9) stale = 0;
    cur = cand;
    curCost = res.cost;
    text = res.text;
    writeFileSync(`.scratch/out/shape-${name}.txt`, `${cur.join(',')}\n${curCost}\n${text}\n`);
  } else stale++;
  if (stale > 30) {
    step = Math.max(0.01, step * 0.7);
    stale = 0;
  }
  if (i % 10 === 0) console.log(name, `#${i}`, curCost.toFixed(4), cur.join(','), text);
}
console.log(name, 'done', curCost.toFixed(4), cur.join(','), text);
