/* SCRATCH: landing band (in turns of rotation) of single-flip windows, per shape, with a fixed tuning. */
import { readFileSync } from 'node:fs';
import { findWindows, sweepPowers, widestWindow } from './core/flipWindow';
import { setShape } from './core/bottleShape';
import { START } from './eval';

const file = process.argv[2]!;
const tuning = { ...START, ...(file === '-' ? {} : JSON.parse(readFileSync(file, 'utf8'))) };
const shapes = process.argv.slice(5);
const TURN = 2 * Math.PI;

for (const text of shapes) {
  setShape(text.split(',').map(Number));
  const out: string[] = [];
  for (const water of [0.1, 0.5, 0.9]) {
    const pts = sweepPowers(water, tuning);
    const s = widestWindow(findWindows(pts), 1);
    if (!s || s.low < 1 || s.high > 99) {
      out.push(`${water}: none`);
      continue;
    }
    const r = (p: number): number => pts[p]!.rotation / TURN;
    const band = (r(s.high) + r(s.high + 1)) / 2 - (r(s.low) + r(s.low - 1)) / 2;
    out.push(`${water}: w${s.width} c${s.center} band ${band.toFixed(3)}`);
  }
  console.log(text, '|', out.join(' | '));
}
