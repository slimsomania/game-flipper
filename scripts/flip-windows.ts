/**
 * Measure the flip windows of the default tuning: `npx tsx scripts/flip-windows.ts`.
 *
 * For each water level from 10% to 90% (every 10 points) it throws one bottle at every power from
 * 0 to 100 (headless, through `src/core/flipWindow.ts`) and prints two windows: the single-flip
 * window (the widest run of powers that land upright after exactly one turn) and the double-flip
 * window (the same with two turns), each as low, high, center and width, or `none`. Calibration
 * (F009) and the difficulty benchmark (F020) start from this table.
 */
import { findWindows, sweepPowers, widestWindow, type FlipWindow } from '../src/core/flipWindow';

const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

const pad = (text: string | number, width: number): string => String(text).padStart(width);
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The four columns of one window (low, high, center, width), or `none` in the first. */
function cells(window: FlipWindow | null): string {
  if (!window) return `${pad('none', 5)}${pad('', 5 + 7 + 6 + 3)}`; // blanks keep the columns aligned
  return [
    pad(window.low, 5),
    pad(window.high, 5),
    pad(num(window.center), 7),
    pad(window.width, 6),
  ].join(' ');
}

const started = Date.now();
const columns = `${pad('low', 5)} ${pad('high', 5)} ${pad('center', 7)} ${pad('width', 6)}`;
const lines = [
  `${pad('', 6)} ${'single flip (1 turn)'.padEnd(columns.length)}   double flip (2 turns)`,
  `${pad('water', 6)} ${columns}   ${columns}`,
];
for (const water of LEVELS) {
  const windows = findWindows(sweepPowers(water));
  const label = `${Math.round(water * 100)}%`;
  lines.push(
    `${pad(label, 6)} ${cells(widestWindow(windows, 1))}   ${cells(widestWindow(windows, 2))}`,
  );
}
console.log(lines.map((line) => line.trimEnd()).join('\n'));
console.log(`(power 0 to 100 in steps of 1; ${((Date.now() - started) / 1000).toFixed(1)} s)`);
