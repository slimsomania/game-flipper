import { HAND_Y } from '../src/core/bottle';
import { findWindows, sweepPowers, widestWindow } from '../src/core/flipWindow';
import { bottleExtent } from '../src/core/outcome';
import { Simulation } from '../src/core/simulation';
import { TABLE_TOP_Y } from '../src/core/table';
import { resolveTuning } from '../src/core/tuning';

const tuning = resolveTuning(JSON.parse(process.argv[2] ?? '{}'));
console.log('hand y', HAND_Y, 'table top y', TABLE_TOP_Y);
for (const water of [0.1, 0.5, 0.9]) {
  const w = widestWindow(findWindows(sweepPowers(water, tuning)), 1);
  if (!w) {
    console.log(water, 'no window');
    continue;
  }
  const power = Math.round(w.center);
  const sim = new Simulation({ seed: 1, tuning });
  sim.setWater(water);
  sim.throwBottle(power);
  let top = Infinity;
  let apex = Infinity;
  let right = -Infinity;
  let steps = 0;
  let firstLand = 0;
  for (let i = 0; i < 400 && sim.phase === 'flying'; i++) {
    sim.step();
    steps++;
    const { x, y, angle } = sim.snapshot().bottle;
    const box = bottleExtent(x, y, angle);
    top = Math.min(top, box.minY);
    apex = Math.min(apex, y);
    right = Math.max(right, box.maxX);
    if (!firstLand && i > 5 && box.maxY >= TABLE_TOP_Y - 0.01) firstLand = i;
  }
  const s = sim.snapshot();
  console.log(
    `water ${water} power ${power}: base apex rises ${(HAND_Y - apex).toFixed(2)} m above hand; top of bottle y ${top.toFixed(2)} (hand y ${HAND_Y.toFixed(2)}), right ${right.toFixed(2)}, landed step ${firstLand}, ended ${s.outcome?.result} ${s.outcome?.reason} turns ${s.outcome?.turns} at x ${s.bottle.x.toFixed(2)} after ${steps} steps`,
  );
}
