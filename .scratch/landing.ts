/* SCRATCH: landing angle (turns) at first table contact for each power. Usage: tsx landing.ts file _ _ shape water from to */
import { readFileSync } from 'node:fs';
import { Simulation } from './core/simulation';
import { bottleExtent } from './core/outcome';
import { TABLE_TOP_Y } from './core/table';
import { START } from './eval';

const file = process.argv[2]!;
const tuning = { ...START, ...(file === '-' ? {} : JSON.parse(readFileSync(file, 'utf8'))) };
const water = Number(process.argv[6]);
const from = Number(process.argv[7] ?? 0);
const to = Number(process.argv[8] ?? 100);
for (let p = from; p <= to; p++) {
  const sim = new Simulation({ seed: 1, tuning });
  sim.setWater(water);
  sim.throwBottle(p);
  let landed = '';
  for (let i = 0; i < 400 && sim.phase === 'flying'; i++) {
    sim.step();
    const b = sim.snapshot().bottle;
    if (bottleExtent(b.x, b.y, b.angle).maxY >= TABLE_TOP_Y - 0.03) {
      landed = `land step ${i} angle ${(b.angle / (2 * Math.PI)).toFixed(3)} omega ${b.omega.toFixed(2)} vy ${b.vy.toFixed(2)} vx ${b.vx.toFixed(2)}`;
      break;
    }
  }
  while (sim.phase === 'flying') sim.step();
  const o = sim.snapshot().outcome!;
  console.log(p, o.result, 'final rot', (o.rotation / (2 * Math.PI)).toFixed(2), '|', landed);
}
