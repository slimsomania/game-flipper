/**
 * Measure the flip windows and the difficulty of the default tuning:
 * `npx tsx scripts/flip-windows.ts [name=value ...]`.
 *
 * For each water level from 10% to 90% (every 10 points) it throws one bottle at every power from
 * 0 to 100 (headless, through `src/core/flipWindow.ts`) and prints two windows: the single-flip
 * window (the widest run of powers that land upright after exactly one turn) and the double-flip
 * window (the same with two turns), each as low, high, center and width, or `none`.
 *
 * Then it runs the difficulty benchmark (`src/core/difficulty.ts`: 200 random bottles, a practiced
 * and a new simulated player, both with a normal error of about 8 points of power) and prints how
 * often each lands, the best single fixed power and how often it lands, and each player's average
 * points per 10 throws. The design's targets (section 3) count landings: a new player lands about
 * 20 to 40%, a practiced player 60 to 80%, and no fixed power more than about 60%.
 *
 * Arguments of the form `name=value` override a tuning number (for example
 * `npx tsx scripts/flip-windows.ts shellDensity=0.4 throwLinearImpulse=2.5`), to try a tuning
 * before changing the defaults in `src/core/tuning.ts`.
 */
import { runBenchmark } from '../src/core/difficulty';
import { findWindows, sweepPowers, widestWindow, type FlipWindow } from '../src/core/flipWindow';
import { DEFAULT_TUNING, type Tuning } from '../src/core/tuning';

const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

const pad = (text: string | number, width: number): string => String(text).padStart(width);
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const percent = (rate: number): string => `${(rate * 100).toFixed(1)}%`;

/** The overrides given as `name=value` arguments; an unknown name or a non-number is an error. */
function overridesFromArgs(args: readonly string[]): Partial<Tuning> {
  const overrides: Record<string, number> = {};
  for (const arg of args) {
    const [name, text] = arg.split('=');
    const value = Number(text);
    if (!name || !(name in DEFAULT_TUNING) || text === undefined || !Number.isFinite(value)) {
      console.error(`Unknown argument "${arg}": use name=value with a number from the tuning.`);
      process.exit(1);
    }
    overrides[name] = value;
  }
  return overrides as Partial<Tuning>;
}

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
const tuning = overridesFromArgs(process.argv.slice(2));
const columns = `${pad('low', 5)} ${pad('high', 5)} ${pad('center', 7)} ${pad('width', 6)}`;
const lines = [
  `${pad('', 6)} ${'single flip (1 turn)'.padEnd(columns.length)}   double flip (2 turns)`,
  `${pad('water', 6)} ${columns}   ${columns}`,
];
for (const water of LEVELS) {
  const windows = findWindows(sweepPowers(water, tuning));
  const label = `${Math.round(water * 100)}%`;
  lines.push(
    `${pad(label, 6)} ${cells(widestWindow(windows, 1))}   ${cells(widestWindow(windows, 2))}`,
  );
}
console.log(lines.map((line) => line.trimEnd()).join('\n'));

const result = runBenchmark({ tuning });
const aim = Math.round(result.newPlayerAim * 10) / 10;
// The two fixed powers are a perfect hand with no error: a ceiling for "ignore the water".
const rows: [player: string, rate: string, points: string][] = [
  [
    'practiced player (aims at each window center)',
    percent(result.practiced.landingRate),
    result.practiced.pointsPer10.toFixed(1),
  ],
  [
    `new player (one fixed power, ${aim})`,
    percent(result.newPlayer.landingRate),
    result.newPlayer.pointsPer10.toFixed(1),
  ],
  [
    `best fixed power (${result.bestFixed.power}, no error)`,
    percent(result.bestFixed.landingRate),
    result.bestFixed.pointsPer10.toFixed(1),
  ],
  [
    `best-scoring fixed power (${result.bestScoringFixed.power}, no error)`,
    percent(result.bestScoringFixed.landingRate),
    result.bestScoringFixed.pointsPer10.toFixed(1),
  ],
];
console.log('');
console.log(
  `difficulty benchmark: ${result.bottles} random bottles, seed ${result.seed}, error σ ${result.errorSigma} points`,
);
console.log(`${'player'.padEnd(58)}${pad('landing rate', 14)}${pad('points per 10', 15)}`);
for (const [player, rate, points] of rows) {
  console.log(`${player.padEnd(58)}${pad(rate, 14)}${pad(points, 15)}`);
}
// The rates above are one draw of 200 bottles; the expected rates are free of that luck (every water
// level equally likely, the error integrated over every power), and are what a tuning is judged on.
const { expected } = result;
console.log('');
console.log(
  `expected landing rates, any seed (aim ${expected.newPlayerAim.toFixed(1)}): practiced ${percent(expected.practiced)}, new player ${percent(expected.newPlayer)}`,
);
console.log(`(power 0 to 100 in steps of 1; ${((Date.now() - started) / 1000).toFixed(1)} s)`);
