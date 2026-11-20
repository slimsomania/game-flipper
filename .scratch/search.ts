/* SCRATCH: hill-climb the tuning for one fixed bottle shape (SHAPE env). Usage: tsx search.ts name iters [startFile] */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { evaluate, START } from './eval';
import type { Tuning } from './core/tuning';

const [name = 'run', itersArg = '300', startFile] = process.argv.slice(2);
const iters = Number(itersArg);
mkdirSync('.scratch/out', { recursive: true });

type Key = keyof Tuning;
const BOUNDS: Partial<Record<Key, [number, number]>> = {
  shellDensity: [0.03, 1.5],
  throwLinearImpulse: [1.5, 14],
  throwAngularImpulse: [0.5, 12],
  throwSpinGrowth: [0, 0.04],
  throwSpinExponent: [0.005, 1],
  bottleAngularDamping: [0.3, 7],
  bottleFriction: [0.2, 1.5],
  bottleRestitution: [0, 0.3],
  bottleLinearDamping: [0, 1.2],
  throwAngleDeg: [0, 25],
};
const KEYS = Object.keys(BOUNDS) as Key[];

let seed = Array.from(name).reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const normal = (): number => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

let current: Tuning =
  startFile && existsSync(startFile)
    ? { ...START, ...JSON.parse(readFileSync(startFile, 'utf8')) }
    : { ...START };
let { cost: currentCost, detail } = evaluate(current);
console.log(
  `${name} start cost ${currentCost.toFixed(2)} practiced ${(detail.practiced * 100).toFixed(1)} new ${(detail.newPlayer * 100).toFixed(1)} ratio ${detail.ratio.toFixed(2)}`,
);
let step = 0.06;
let sinceBetter = 0;

function save(): void {
  const tuned: Record<string, number> = {};
  for (const k of KEYS) tuned[k] = current[k] as number;
  writeFileSync(`.scratch/out/${name}.json`, JSON.stringify(tuned, null, 1));
}
save();

for (let i = 1; i <= iters; i++) {
  const candidate = { ...current };
  const count = 1 + Math.floor(rand() * 3);
  for (let c = 0; c < count; c++) {
    const key = KEYS[Math.floor(rand() * KEYS.length)]!;
    const [lo, hi] = BOUNDS[key]!;
    const value = (candidate[key] as number) * Math.exp(step * normal());
    (candidate[key] as number) = Math.min(hi, Math.max(lo, value));
  }
  let result;
  try {
    result = evaluate(candidate);
  } catch {
    continue;
  }
  if (result.cost <= currentCost) {
    const better = result.cost < currentCost - 1e-9;
    current = candidate;
    currentCost = result.cost;
    detail = result.detail;
    if (better) {
      sinceBetter = 0;
      save();
    }
  } else sinceBetter++;
  if (sinceBetter > 40) {
    step = Math.max(0.01, step * 0.7);
    sinceBetter = 0;
  }
  if (i % 25 === 0 || currentCost < 0.01) {
    const s = detail.singles.map((w) => (w ? `${w.low}-${w.high}` : 'x')).join(' ');
    const d = detail.doubles.map((w) => (w ? `${w.low}-${w.high}` : 'x')).join(' ');
    console.log(
      `${name} #${i} cost ${currentCost.toFixed(2)} step ${step.toFixed(3)} P ${(detail.practiced * 100).toFixed(1)} N ${(detail.newPlayer * 100).toFixed(1)} fix ${(detail.bestFixed * 100).toFixed(0)}@${detail.bestFixedPower} sh ${detail.singleShare} r ${detail.ratio.toFixed(2)} | S ${s} | D ${d} | ${detail.notes.slice(0, 5).join(' ')}`,
    );
  }
  if (currentCost < 0.01) break;
}
save();
console.log(`${name} done cost ${currentCost.toFixed(3)}`);
console.log(
  JSON.stringify(
    detail.flight.map((f) => ({
      rise: +f.rise.toFixed(2),
      x: +f.x.toFixed(2),
      top: +f.top.toFixed(2),
    })),
  ),
);
