/**
 * Measure the flip windows of the default tuning: `npx tsx scripts/flip-windows.ts`.
 *
 * For each water level from 10% to 90% (every 10 points) it throws one bottle at every power from
 * 0 to 100 (headless, through `src/core/flipWindow.ts`) and prints the single-flip window: the
 * widest run of powers that land upright after exactly one turn. Calibration (F009) and the
 * difficulty benchmark (F020) start from this table.
 */
import { findWindows, sweepPowers, widestWindow } from '../src/core/flipWindow';

const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

const pad = (text: string | number, width: number): string => String(text).padStart(width);
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const started = Date.now();
const lines = [
  `${pad('water', 6)} ${pad('low', 5)} ${pad('high', 5)} ${pad('center', 7)} ${pad('width', 6)}`,
];
for (const water of LEVELS) {
  const windows = findWindows(sweepPowers(water));
  const single = widestWindow(windows, 1);
  const label = `${Math.round(water * 100)}%`;
  lines.push(
    single
      ? `${pad(label, 6)} ${pad(single.low, 5)} ${pad(single.high, 5)} ${pad(num(single.center), 7)} ${pad(single.width, 6)}`
      : `${pad(label, 6)} ${pad('none', 5)}`,
  );
}
console.log(lines.join('\n'));
console.log(`(power 0 to 100 in steps of 1; ${((Date.now() - started) / 1000).toFixed(1)} s)`);
