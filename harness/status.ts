/** npm run agents:status: where the build stands, at a glance. */
import { existsSync, readFileSync } from 'node:fs';
import { loadConfig } from './lib/config';
import {
  counts,
  emptyFeatureList,
  milestoneProgress,
  parseFeatureList,
  pickNext,
  type NextAction,
} from './lib/features';
import { c } from './lib/log';
import { PATHS } from './lib/paths';
import { loadRunState } from './lib/runState';

function bar(done: number, total: number, width = 20): string {
  const filled = total ? Math.round((done / total) * width) : 0;
  return `${c.green('█'.repeat(filled))}${c.dim('░'.repeat(width - filled))}`;
}

function describe(next: NextAction): string {
  switch (next.kind) {
    case 'plan':
      return `planner (${next.mode} plan)`;
    case 'build':
      return `builder on ${next.feature.id} "${next.feature.title}" (attempt ${next.feature.attempts + 1})`;
    case 'review':
      return `reviewer on ${next.feature.id} "${next.feature.title}"`;
    case 'maintain':
      return 'maintainer (cleanup pass)';
    case 'complete':
      return 'nothing: every feature is done';
    case 'stuck':
      return `nothing can run: ${next.reason}`;
  }
}

const text = existsSync(PATHS.featureList) ? readFileSync(PATHS.featureList, 'utf8') : null;
const parsed = text ? parseFeatureList(text) : { ok: true as const, list: emptyFeatureList() };
if (!parsed.ok) {
  console.error(`harness/state/feature_list.json is invalid:\n  - ${parsed.errors.join('\n  - ')}`);
  process.exit(1);
}
const list = parsed.list;
const cfg = loadConfig();
const runState = loadRunState();
const k = counts(list);

console.log(c.bold('Flipper: build status'));
if (k.total === 0) {
  console.log(
    '\nNo plan yet. Describe the game in docs/GAME_DESIGN.md, set "status: ready", commit, then run:',
  );
  console.log('  npm run agents -- --plan');
  process.exit(0);
}

console.log(
  `\nFeatures: ${k.done}/${k.total} done · ${k.needs_review} in review · ${k.todo} todo · ${k.blocked} blocked\n`,
);
for (const m of milestoneProgress(list)) {
  const mark = m.complete ? c.green('✔') : ' ';
  console.log(
    `${mark} ${m.id.padEnd(4)} ${bar(m.done, m.total)} ${String(m.done).padStart(3)}/${String(m.total).padEnd(3)} ${m.title}`,
  );
}

const maintenanceDue =
  cfg.maintenanceEvery > 0 && k.done - runState.doneAtLastMaintenance >= cfg.maintenanceEvery;
console.log(`\nNext session: ${describe(pickNext(list, { maintenanceDue }))}`);
if (runState.lastGate) {
  const g = runState.lastGate;
  console.log(
    `Last harness check (session ${g.session}): npm run verify ${g.ok ? c.green('passed') : c.red('FAILED')}`,
  );
}

const blocked = list.features.filter((f) => f.status === 'blocked');
if (blocked.length) {
  console.log(c.yellow('\nBlocked (need a human):'));
  for (const f of blocked)
    console.log(
      `  ${f.id} ${f.title}\n     ${c.dim(f.notes || f.review_feedback || '(no notes)')}`,
    );
}

if (existsSync(PATHS.ledger)) {
  const recent = readFileSync(PATHS.ledger, 'utf8').trim().split('\n').slice(-8);
  console.log('\nRecent sessions:');
  for (const line of recent) {
    try {
      const e = JSON.parse(line) as Record<string, unknown>;
      const cost = typeof e.costUsd === 'number' ? ` · $${e.costUsd.toFixed(2)}` : '';
      const minutes =
        typeof e.durationMs === 'number' ? ` · ${Math.round(e.durationMs / 60_000)} min` : '';
      const change = e.statusAfter ? ` · ${String(e.statusBefore)} → ${String(e.statusAfter)}` : '';
      console.log(
        `  #${String(e.session)} ${String(e.role)} ${e.feature ? String(e.feature) : ''}${change} · ${String(e.outcome)}${minutes}${cost}`,
      );
    } catch {
      // skip malformed lines
    }
  }
}
