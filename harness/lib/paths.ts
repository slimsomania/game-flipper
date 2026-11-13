import { realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** harness/ directory. realpath gives the canonical casing on Windows ("C:\", not "c:\"). */
export const HARNESS_DIR = realpathSync.native(
  resolve(dirname(fileURLToPath(import.meta.url)), '..'),
);
export const REPO_ROOT = resolve(HARNESS_DIR, '..');

export const PATHS = {
  config: join(HARNESS_DIR, 'config.json'),
  prompts: join(HARNESS_DIR, 'prompts'),
  featureList: join(HARNESS_DIR, 'state', 'feature_list.json'),
  progress: join(HARNESS_DIR, 'state', 'progress.md'),
  runState: join(HARNESS_DIR, 'state', 'run_state.json'),
  logs: join(HARNESS_DIR, 'logs'),
  ledger: join(HARNESS_DIR, 'logs', 'ledger.jsonl'),
  stopFile: join(HARNESS_DIR, 'STOP'),
  lockFile: join(HARNESS_DIR, '.lock'),
  gameDesign: join(REPO_ROOT, 'docs', 'GAME_DESIGN.md'),
  packageJson: join(REPO_ROOT, 'package.json'),
} as const;

/** Repo-relative paths with forward slashes, the way git reports them. */
export const REL = {
  featureList: 'harness/state/feature_list.json',
  progress: 'harness/state/progress.md',
  runState: 'harness/state/run_state.json',
  claudeSettings: 'harness/claude-settings.json',
  architecture: 'docs/ARCHITECTURE.md',
  packageJson: 'package.json',
} as const;
