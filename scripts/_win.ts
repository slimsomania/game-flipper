import { findWindows, sweepPowers } from '../src/core/flipWindow';

for (const water of [0.1, 0.3, 0.5, 0.7, 0.9]) {
  const windows = findWindows(sweepPowers(water));
  console.log(
    `${water}: ` + windows.map((w) => `${w.turns}t ${w.low}-${w.high}`).join(', '),
  );
}
