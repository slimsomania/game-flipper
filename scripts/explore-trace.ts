// THROWAWAY: state at first table contact for a range of powers. Deleted before commit.
// usage: npx tsx scripts/explore-trace.ts '<tuningJson>' water from to step '<shapeJson>'
const shapeArg = process.argv[7];
if (shapeArg) process.env.FLIPPER_SHAPE = shapeArg;
const { Simulation } = await import('../src/core/simulation');
const { bottleExtent } = await import('../src/core/outcome');

const tuning = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const water = Number(process.argv[3] ?? 0.5);
const from = Number(process.argv[4] ?? 20);
const to = Number(process.argv[5] ?? 60);
const stepP = Number(process.argv[6] ?? 2);
const TWO_PI = Math.PI * 2;

for (let p = from; p <= to; p += stepP) {
  const sim = new Simulation({ seed: 1, tuning });
  sim.setWater(water);
  sim.throwBottle(p);
  let steps = 0;
  let apex = Infinity;
  let landed = '';
  while (sim.phase === 'flying' && steps < 400) {
    sim.step();
    steps++;
    const b = sim.snapshot().bottle;
    apex = Math.min(apex, b.y);
    // first time the bottle is moving down and its lowest corner reached the table (y >= 5.6 - eps)
    if (!landed && b.vy > 0 && bottleExtent(b.x, b.y, b.angle).maxY >= 5.6 - 0.02) {
      const a = (((b.angle % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI;
      landed = `t=${(steps / 60).toFixed(2)}s y=${b.y.toFixed(2)} angle=${a.toFixed(3)}turn omega=${b.omega.toFixed(2)} vx=${b.vx.toFixed(2)} vy=${b.vy.toFixed(2)}`;
    }
  }
  const o = sim.snapshot().outcome!;
  console.log(
    `p${p} apexRise=${(4.6 - apex).toFixed(2)} | ${landed} | ${o.result === 'success' ? 'S' + o.turns : o.reason} rot=${(o.rotation / TWO_PI).toFixed(2)}`,
  );
}
