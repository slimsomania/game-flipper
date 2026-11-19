import { findWindows, sweepPowers, widestWindow } from '../src/core/flipWindow';
import { resolveTuning } from '../src/core/tuning';

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
function rate(aim: number, ok: boolean[]): number {
  let total = 0;
  for (let p = 0; p <= 100; p++) {
    const lo = p === 0 ? -Infinity : (p - 0.5 - aim) / SIGMA;
    const hi = p === 100 ? Infinity : (p + 0.5 - aim) / SIGMA;
    if (ok[p]) total += cdf(hi) - cdf(lo);
  }
  return total;
}

const tuning = resolveTuning(JSON.parse(process.argv[2] ?? '{}'));
const levels: number[] = [];
for (let i = 0; i <= 16; i++) levels.push(Math.round((0.1 + i * 0.05) * 1e6) / 1e6);
const data = levels.map((w) => {
  const pts = sweepPowers(w, tuning);
  const single = widestWindow(findWindows(pts), 1)!;
  return {
    w,
    center: single.center,
    width: single.width,
    ok: pts.map((p) => p.result === 'success'),
  };
});
const aim = data.reduce((s, d) => s + d.center, 0) / data.length;
const prac = data.reduce((s, d) => s + rate(d.center, d.ok), 0) / data.length;
const neu = data.reduce((s, d) => s + rate(aim, d.ok), 0) / data.length;
console.log(
  `17 levels: aim ${aim.toFixed(2)} expected practiced ${prac.toFixed(3)} new ${neu.toFixed(3)}`,
);
for (const d of data) {
  console.log(
    `${d.w.toFixed(2)} c${d.center} w${d.width} P(prac) ${rate(d.center, d.ok).toFixed(2)} P(new) ${rate(aim, d.ok).toFixed(2)}`,
  );
}
