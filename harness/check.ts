/** npm run agents:check: validate harness/state/feature_list.json. Exit code 1 if it is invalid. */
import { readFileSync } from 'node:fs';
import { counts, milestoneProgress, parseFeatureList } from './lib/features';
import { PATHS } from './lib/paths';

const result = parseFeatureList(readFileSync(PATHS.featureList, 'utf8'));
if (!result.ok) {
  console.error('harness/state/feature_list.json has problems:');
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const k = counts(result.list);
const empty = milestoneProgress(result.list).filter((m) => m.total === 0);
console.log(
  `OK: ${k.total} features in ${result.list.milestones.length} milestones ` +
    `(${k.done} done, ${k.needs_review} in review, ${k.todo} todo, ${k.blocked} blocked).`,
);
for (const m of empty) console.log(`Warning: milestone ${m.id} "${m.title}" has no features.`);
