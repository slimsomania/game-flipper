/* SCRATCH: print one sweep. Usage: tsx sweep.ts file _ _ shape water [from to] */
import { readFileSync } from 'node:fs';
import { sweepPowers } from './core/flipWindow';
import { START } from './eval';

const file = process.argv[2]!;
const tuning = { ...START, ...(file === '-' ? {} : JSON.parse(readFileSync(file, 'utf8'))) };
const water = Number(process.argv[6]);
const from = Number(process.argv[7] ?? 0);
const to = Number(process.argv[8] ?? 100);
const powers = Array.from({ length: to - from + 1 }, (_, i) => from + i);
for (const p of sweepPowers(water, tuning, powers)) {
  console.log(
    p.power,
    p.result,
    'turns',
    p.turns,
    'rot',
    (p.rotation / (2 * Math.PI)).toFixed(3),
    'steps',
    p.steps,
    p.reason ?? '',
  );
}
