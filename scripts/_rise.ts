import { HAND_X, HAND_Y } from '../src/core/bottle';
import { findWindows, sweepPowers, widestWindow } from '../src/core/flipWindow';
import { bottleExtent } from '../src/core/outcome';
import { Simulation } from '../src/core/simulation';
import { resolveTuning } from '../src/core/tuning';

/** How far the highest point of the bottle rises above where the held bottle's top is. */
export function riseAt(water: number, power: number, tuning: ReturnType<typeof resolveTuning>) {
  const startTop = bottleExtent(HAND_X, HAND_Y, 0).minY;
  const sim = new Simulation({ seed: 1, tuning });
  sim.setWater(water);
  sim.throwBottle(power);
  let top = Infinity;
  let landedStep = 0;
  for (let i = 0; i < 300 && sim.phase === 'flying'; i++) {
    sim.step();
    const { x, y, angle } = sim.snapshot().bottle;
    top = Math.min(top, bottleExtent(x, y, angle).minY);
    if (!landedStep && i > 5 && y >= HAND_Y + 0.99) landedStep = i;
  }
  return { rise: startTop - top, landedStep, outcome: sim.snapshot().outcome };
}

if (process.argv[1]?.includes('_rise')) {
  const tuning = resolveTuning(JSON.parse(process.argv[2] ?? '{}'));
  for (const water of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const w = widestWindow(findWindows(sweepPowers(water, tuning)), 1)!;
    const r = riseAt(water, Math.round(w.center), tuning);
    console.log(
      `${water}: center ${w.center} width ${w.width}: top rises ${r.rise.toFixed(2)} m above the held bottle's top, base reaches the table at step ${r.landedStep}`,
    );
  }
}
