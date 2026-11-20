/* SCRATCH: landing-angle band (turns, at first table contact) of the single window, per shape and level.
 * Usage: tsx band2.ts file _ _ _ shape1 shape2 ...   (argv[5] is the first shape: it also sets the module's start shape) */
import { readFileSync } from 'node:fs';
import { setShape } from './core/bottleShape';
import { Simulation } from './core/simulation';
import { bottleExtent } from './core/outcome';
import { TABLE_TOP_Y } from './core/table';
import { START } from './eval';

const file = process.argv[4]!;
const tuning = { ...START, ...(file === '-' ? {} : JSON.parse(readFileSync(file, 'utf8'))) };
const TURN = 2 * Math.PI;

function throwAt(water: number, p: number) {
  const sim = new Simulation({ seed: 1, tuning });
  sim.setWater(water);
  sim.throwBottle(p);
  let land = NaN;
  for (let i = 0; i < 400 && sim.phase === 'flying'; i++) {
    sim.step();
    const b = sim.snapshot().bottle;
    if (Number.isNaN(land) && bottleExtent(b.x, b.y, b.angle).maxY >= TABLE_TOP_Y - 0.03) land = b.angle / TURN;
  }
  const o = sim.snapshot().outcome!;
  return { ok: o.result === 'success' && o.turns === 1, land };
}

export function bands(shape: number[], levels = [0.1, 0.5, 0.9]) {
  setShape(shape);
  return levels.map((water) => {
    const rows = Array.from({ length: 101 }, (_, p) => throwAt(water, p));
    // widest run of ok
    let best = { lo: -1, hi: -1 };
    let start = -1;
    for (let p = 0; p <= 101; p++) {
      const ok = p <= 100 && rows[p]!.ok;
      if (ok && start < 0) start = p;
      if (!ok && start >= 0) {
        if (p - 1 - start > best.hi - best.lo) best = { lo: start, hi: p - 1 };
        start = -1;
      }
    }
    if (best.lo < 1 || best.hi > 99) return { water, width: 0, band: 0, lowEdge: NaN, highEdge: NaN, center: 0 };
    const lowEdge = (rows[best.lo]!.land + rows[best.lo - 1]!.land) / 2;
    const highEdge = (rows[best.hi]!.land + rows[best.hi + 1]!.land) / 2;
    return { water, width: best.hi - best.lo, band: highEdge - lowEdge, lowEdge, highEdge, center: (best.lo + best.hi) / 2 };
  });
}

if (process.argv[1]?.endsWith('band2.ts')) {
  for (const text of process.argv.slice(5)) {
    const r = bands(text.split(',').map(Number));
    console.log(text, '|', r.map((x) => `${x.water}: w${x.width} c${x.center} band ${x.band.toFixed(3)} [${x.lowEdge.toFixed(2)},${x.highEdge.toFixed(2)}]`).join(' | '));
  }
}
