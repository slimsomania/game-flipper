/* SCRATCH: print the full evaluation of a saved tuning. Usage: tsx show.ts file _ _ shape */
import { readFileSync } from 'node:fs';
import { evaluate, START } from './eval';

const file = process.argv[2]!;
const tuning: Record<string, number> = { ...START, ...JSON.parse(readFileSync(file, 'utf8')) };
for (const arg of process.argv.slice(6)) {
  const [k, v] = arg.split('=');
  tuning[k!] = Number(v);
}
const { cost, detail } = evaluate(tuning);
console.log('shape', process.argv[5]);
console.log('cost', cost.toFixed(2));
console.log('practiced', (detail.practiced * 100).toFixed(1), 'new', (detail.newPlayer * 100).toFixed(1), 'newAim', detail.newAim.toFixed(1));
console.log('bestFixed', (detail.bestFixed * 100).toFixed(1), '@', detail.bestFixedPower, 'singleShare', detail.singleShare, 'ratio', detail.ratio.toFixed(2));
console.log('S', detail.singles.map((w) => (w ? `${w.low}-${w.high}(${w.width})` : 'x')).join(' '));
console.log('D', detail.doubles.map((w) => (w ? `${w.low}-${w.high}(${w.width})` : 'x')).join(' '));
console.log('flights', JSON.stringify(detail.flight.map((f) => ({ rise: +f.rise.toFixed(2), x: +f.x.toFixed(2), top: +f.top.toFixed(2), ok: f.ok }))));
console.log('notes', detail.notes.join(' | '));
