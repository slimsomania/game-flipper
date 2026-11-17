// THROWAWAY exploration script for F009 (deleted before commit).
// usage: npx tsx scripts/explore.ts '<tuningJson>' <levels,comma> <y|rot> '<shapeJson>'
if (process.argv[5]) process.env.FLIPPER_SHAPE = process.argv[5];
const { findWindows, sweepPowers, widestWindow } = await import('../src/core/flipWindow');

const overrides = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const levels = process.argv[3] ? process.argv[3].split(',').map(Number) : [0.1, 0.3, 0.5, 0.7, 0.9];

for (const water of levels) {
  const pts = sweepPowers(water, overrides);
  const wins = findWindows(pts);
  const w1 = widestWindow(wins, 1);
  const w2 = widestWindow(wins, 2);
  const fmt = (w: ReturnType<typeof widestWindow>): string =>
    w ? `${w.low}-${w.high}(c${w.center},w${w.width})` : 'none';
  console.log(`water ${water}: single ${fmt(w1)} double ${fmt(w2)}`);
  if (process.argv[4]) {
    let line1 = '';
    let line2 = '';
    for (const p of pts) {
      line1 += p.result === 'success' ? String(p.turns) : p.reason[0]!;
      line2 += `${p.power}:${(p.rotation / (2 * Math.PI)).toFixed(2)} `;
    }
    console.log(line1);
    if (process.argv[4] === 'rot') console.log(line2);
  }
}
