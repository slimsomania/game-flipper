import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PATHS } from './paths';

/** Bookkeeping that only the harness writes (harness/state/run_state.json, committed). */
export interface RunState {
  /** Number of the last session that ran; sessions are numbered across runs. */
  sessions: number;
  /** Count of done features when the last maintainer session ran. */
  doneAtLastMaintenance: number;
  /** Commit before the first builder session of each feature, so reviewers see the whole diff. */
  featureBase: Record<string, string>;
  /** Result of the harness's own `npm run verify` after the last builder/maintainer session. */
  lastGate: { session: number; ok: boolean; tail: string } | null;
  /** What the harness reverted after the last session, shown to the next one. */
  lastViolations: string[];
}

export function emptyRunState(): RunState {
  return {
    sessions: 0,
    doneAtLastMaintenance: 0,
    featureBase: {},
    lastGate: null,
    lastViolations: [],
  };
}

export function parseRunState(text: string | null): RunState {
  if (!text) return emptyRunState();
  try {
    return { ...emptyRunState(), ...(JSON.parse(text) as Partial<RunState>) };
  } catch {
    return emptyRunState();
  }
}

export function loadRunState(): RunState {
  return parseRunState(existsSync(PATHS.runState) ? readFileSync(PATHS.runState, 'utf8') : null);
}

export function saveRunState(state: RunState): void {
  writeFileSync(PATHS.runState, `${JSON.stringify(state, null, 2)}\n`);
}
