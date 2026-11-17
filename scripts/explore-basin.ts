// THROWAWAY: map which landing angles end upright (U), on a side (s) or on the cap (c). Deleted before commit.
// usage: npx tsx scripts/explore-basin.ts '<tuningJson>' water omega vy vx '<shapeJson>'
const shapeArg = process.argv[7];
if (shapeArg) process.env.FLIPPER_SHAPE = shapeArg;
const { bottleExtent } = await import('../src/core/outcome');
const { Simulation } = await import('../src/core/simulation');
const { TABLE_TOP_Y } = await import('../src/core/table');

const tuning = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const water = Number(process.argv[3] ?? 0.5);
const omega = Number(process.argv[4] ?? 6);
const vy = Number(process.argv[5] ?? 6);
const vx = Number(process.argv[6] ?? 1.2);

let line = '';
let upright = 0;
for (let deg = -180; deg < 180; deg += 3) {
  const angle = (deg * Math.PI) / 180;
  const sim = new Simulation({ seed: 1, tuning });
  sim.setWater(water);
  const ext = bottleExtent(6, 0, angle);
  const y = TABLE_TOP_Y - 0.03 - ext.maxY;
  sim.placeBottle({ x: 6, y, angle, vx, vy, omega, turns: 1 });
  let steps = 0;
  while (sim.phase === 'flying' && steps < 400) {
    sim.step();
    steps++;
  }
  const o = sim.snapshot().outcome!;
  const ch = o.result === 'success' ? 'U' : o.reason === 'side' ? 's' : o.reason === 'cap' ? 'c' : 'x';
  if (ch === 'U') upright++;
  line += ch;
}
console.log(`omega ${omega} vy ${vy} vx ${vx} water ${water}: upright fraction ${(upright / 120).toFixed(2)}`);
console.log(line);
