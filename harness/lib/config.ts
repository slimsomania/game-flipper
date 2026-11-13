import { readFileSync } from 'node:fs';
import { PATHS } from './paths';

export const ROLES = ['planner', 'builder', 'reviewer', 'maintainer'] as const;
export type Role = (typeof ROLES)[number];

export interface HarnessConfig {
  /** Model per role (alias like "sonnet" / "opus" / "fable" or a full name); null = Claude Code default. */
  models: Record<Role, string | null>;
  /** Effort per role (low, medium, high, xhigh, max); null = Claude Code default. */
  effort: Record<Role, string | null>;
  /** Claude Code permission mode for sessions. */
  permissionMode: string;
  /** Builders hand features to a reviewer session (true) or mark them done themselves (false). */
  review: boolean;
  /** Pause the run when a milestone becomes complete. */
  stopAtMilestones: boolean;
  /** Run a maintainer session after this many newly completed features (0 = never). */
  maintenanceEvery: number;
  /** Sessions per run. */
  maxSessions: number;
  /** Builder attempts before a feature is marked blocked. */
  maxAttemptsPerFeature: number;
  /** Stop after this many sessions in a row without progress. */
  maxConsecutiveFailures: number;
  sessionTimeoutMinutes: number;
  gateTimeoutMinutes: number;
  /** Passed to `claude --max-budget-usd` when not null. */
  maxBudgetUsdPerSession: number | null;
  /**
   * Before starting a session, wait for the reset if the last reported 5-hour (or weekly) usage
   * was at least this percentage, so sessions aren't cut off midway. null = never wait early.
   */
  pauseAtUsagePercent: number | null;
  /** Wait this long after a usage limit when Claude Code doesn't report a reset time. */
  usageLimitWaitMinutes: number;
  maxUsageLimitWaits: number;
  pauseBetweenSessionsSeconds: number;
}

const perRole = <T>(value: T): Record<Role, T> => ({
  planner: value,
  builder: value,
  reviewer: value,
  maintainer: value,
});

export const DEFAULT_CONFIG: HarnessConfig = {
  models: perRole<string | null>(null),
  effort: perRole<string | null>(null),
  permissionMode: 'acceptEdits',
  review: true,
  stopAtMilestones: true,
  maintenanceEvery: 8,
  maxSessions: 20,
  maxAttemptsPerFeature: 3,
  maxConsecutiveFailures: 3,
  sessionTimeoutMinutes: 75,
  gateTimeoutMinutes: 20,
  maxBudgetUsdPerSession: null,
  pauseAtUsagePercent: 85,
  usageLimitWaitMinutes: 30,
  maxUsageLimitWaits: 16,
  pauseBetweenSessionsSeconds: 5,
};

const NUMBER_KEYS = [
  'maintenanceEvery',
  'maxSessions',
  'maxAttemptsPerFeature',
  'maxConsecutiveFailures',
  'sessionTimeoutMinutes',
  'gateTimeoutMinutes',
  'usageLimitWaitMinutes',
  'maxUsageLimitWaits',
  'pauseBetweenSessionsSeconds',
] as const;

export function parseConfig(raw: unknown): HarnessConfig {
  if (typeof raw !== 'object' || raw === null) throw new Error('config must be a JSON object');
  const input = raw as Partial<HarnessConfig>;
  const cfg: HarnessConfig = {
    ...DEFAULT_CONFIG,
    ...input,
    models: { ...DEFAULT_CONFIG.models, ...input.models },
    effort: { ...DEFAULT_CONFIG.effort, ...input.effort },
  };
  const problems: string[] = [];
  for (const key of NUMBER_KEYS) {
    if (typeof cfg[key] !== 'number' || cfg[key] < 0) problems.push(`${key} must be a number >= 0`);
  }
  for (const key of ['review', 'stopAtMilestones'] as const) {
    if (typeof cfg[key] !== 'boolean') problems.push(`${key} must be true or false`);
  }
  if (cfg.maxBudgetUsdPerSession !== null && typeof cfg.maxBudgetUsdPerSession !== 'number') {
    problems.push('maxBudgetUsdPerSession must be a number or null');
  }
  const pauseAt = cfg.pauseAtUsagePercent;
  if (pauseAt !== null && (typeof pauseAt !== 'number' || pauseAt <= 0 || pauseAt > 100)) {
    problems.push('pauseAtUsagePercent must be a number from 1 to 100, or null');
  }
  for (const role of Object.keys(cfg.models)) {
    if (!(ROLES as readonly string[]).includes(role)) problems.push(`models.${role} is not a role`);
  }
  if (problems.length) throw new Error(`harness/config.json: ${problems.join('; ')}`);
  return cfg;
}

export function loadConfig(): HarnessConfig {
  return parseConfig(JSON.parse(readFileSync(PATHS.config, 'utf8')));
}
