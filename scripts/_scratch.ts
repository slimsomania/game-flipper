import { runBenchmark } from '../src/core/difficulty';
import { findWindows, sweepPowers, widestWindow } from '../src/core/flipWindow';

const tuning = JSON.parse(process.argv[2] ?? '{}');
const seeds = (process.argv[3] ?? '1').split(',').map(Number);
for (const seed of seeds) {
  const r = runBenchmark({ seed, tuning });
  console.log(
    `seed ${seed}: practiced ${r.practiced.landingRate} (${r.practiced.pointsPer10.toFixed(1)} pts/10) new ${r.newPlayer.landingRate} (${r.newPlayer.pointsPer10.toFixed(1)}) aim ${r.newPlayerAim.toFixed(1)} bestFixed ${r.bestFixed.power} ${r.bestFixed.landingRate}`,
  );
}
if (process.argv[4] === 'table') {
  for (const w of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    const ws = findWindows(sweepPowers(w, tuning));
    const s = widestWindow(ws, 1);
    const d = widestWindow(ws, 2);
    console.log(w, s && `${s.low}-${s.high} c${s.center} w${s.width}`, d && `${d.low}-${d.high}`);
  }
}
