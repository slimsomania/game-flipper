import { sweepPowers } from '../src/core/flipWindow';

const levels = Array.from({ length: 17 }, (_, i) => Math.round((0.1 + i * 0.05) * 1e6) / 1e6);
const tuning = JSON.parse(process.argv[2] ?? '{}');
const sweeps = levels.map((w) => sweepPowers(w, tuning));
const SIGMA = 8;
const erf = (x: number): number => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const cdf = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));
/** Expected points of one bottle (its sweep) for an aim, with the normal error. */
function expectedPoints(aim: number, sweep: (typeof sweeps)[number]): number {
  let total = 0;
  for (let p = 0; p <= 100; p++) {
    const lo = p === 0 ? -Infinity : (p - 0.5 - aim) / SIGMA;
    const hi = p === 100 ? Infinity : (p + 0.5 - aim) / SIGMA;
    total += (cdf(hi) - cdf(lo)) * (sweep[p]!.result === 'success' ? sweep[p]!.points : 0);
  }
  return total;
}
const rows: string[] = [];
let best = { power: 0, points: 0 };
let bestNoError = { power: 0, points: 0 };
for (let p = 0; p <= 100; p++) {
  const noError =
    (sweeps.reduce((s, sw) => s + (sw[p]!.result === 'success' ? sw[p]!.points : 0), 0) /
      levels.length) *
    10;
  const withError = (sweeps.reduce((s, sw) => s + expectedPoints(p, sw), 0) / levels.length) * 10;
  if (withError > best.points) best = { power: p, points: withError };
  if (noError > bestNoError.points) bestNoError = { power: p, points: noError };
  if (p % 4 === 2) rows.push(`${p}: ${noError.toFixed(1)} (σ8: ${withError.toFixed(1)})`);
}
console.log('points per 10 throws at one fixed power (no error / with σ 8):');
console.log(rows.join('\n'));
console.log('best with σ 8:', best, 'best with no error:', bestNoError);
