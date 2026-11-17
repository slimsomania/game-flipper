/**
 * Flipper agent harness.
 *
 * Runs Claude Code sessions (`claude -p`) one after another: a planner turns the design doc into
 * a feature list, builders implement one feature per session, reviewers verify each feature, and
 * a maintainer cleans up every few features. Between sessions the harness enforces the rules
 * itself (protected files, allowed status changes, a green build) rather than trusting the agents.
 *
 * Usage: npm run agents -- [options]    (see --help and harness/README.md)
 */
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  claudeVersion,
  runClaudeSession,
  type RateLimitInfo,
  type SessionResult,
  type UsageWindow,
} from './lib/claude';
import { loadConfig, ROLES, type HarnessConfig, type Role } from './lib/config';
import {
  counts,
  emptyFeatureList,
  guardFeatureList,
  milestoneProgress,
  parseFeatureList,
  pickNext,
  serializeFeatureList,
  type Feature,
  type FeatureList,
  type NextAction,
} from './lib/features';
import * as git from './lib/git';
import { appendLedger, c, formatDuration, log, tail } from './lib/log';
import { PATHS, REL } from './lib/paths';
import { renderPrompt } from './lib/prompts';
import { loadRunState, parseRunState, saveRunState, type RunState } from './lib/runState';
import { runCommand, sleep } from './lib/shell';

const HELP = `Flipper agent harness

Usage: npm run agents -- [options]

  --plan                 Run the planner (first plan, or extend it after the design doc changed)
  --once                 Run a single session, then stop
  --max-sessions <n>     Session limit for this run (default: harness/config.json)
  --feature <id>         Build (or review) this feature next, e.g. F012
  --no-review            Builders mark features done without a reviewer session
  --no-milestone-stop    Keep going when a milestone completes
  --no-wait              Stop at a usage limit instead of waiting for it to reset
  --model <name>         Model for every role: sonnet, opus, fable, or a full model name
  --dry-run              Show the next session and its full prompt without running it
  --smoke                Check that headless Claude Code works and the permission rules load
  -h, --help             Show this help

Stop a run with Ctrl+C, or create the file harness/STOP to stop after the current session.
Details: harness/README.md`;

class HarnessError extends Error {}

// ---------------------------------------------------------------------------------------------
// Rules the harness enforces after every session
// ---------------------------------------------------------------------------------------------

/** Paths no agent may change. The harness restores them after every session. */
const PROTECTED = ['harness/', 'CLAUDE.md', 'docs/GAME_DESIGN.md', '.claude/', '.github/'];
/** The harness files agents are expected to update. */
const AGENT_STATE_FILES = new Set<string>([REL.featureList, REL.progress]);
/** package.json scripts that make up the verification gate; agents may not loosen them. */
const GATE_SCRIPTS = ['verify', 'format:check', 'typecheck', 'test', 'build', 'test:e2e'];

function isProtected(path: string, role: Role): boolean {
  if (AGENT_STATE_FILES.has(path)) return false;
  if (role === 'reviewer') return true; // reviewers only record a verdict
  if (role === 'planner') return path !== REL.architecture; // planners don't write code
  return PROTECTED.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}

// ---------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------

interface Cli {
  plan: boolean;
  once: boolean;
  maxSessions: number | null;
  feature: string | null;
  noReview: boolean;
  noMilestoneStop: boolean;
  noWait: boolean;
  model: string | null;
  dryRun: boolean;
  smoke: boolean;
  help: boolean;
}

function parseCli(argv: string[]): Cli {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        plan: { type: 'boolean', default: false },
        once: { type: 'boolean', default: false },
        'max-sessions': { type: 'string' },
        feature: { type: 'string' },
        'no-review': { type: 'boolean', default: false },
        'no-milestone-stop': { type: 'boolean', default: false },
        'no-wait': { type: 'boolean', default: false },
        model: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        smoke: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (err) {
    throw new HarnessError(`${(err as Error).message}\n\n${HELP}`);
  }
  const maxSessions = values['max-sessions'] === undefined ? null : Number(values['max-sessions']);
  if (maxSessions !== null && (!Number.isInteger(maxSessions) || maxSessions < 1)) {
    throw new HarnessError('--max-sessions must be a whole number of at least 1');
  }
  if (values.feature !== undefined && !/^F\d{3,}$/.test(values.feature)) {
    throw new HarnessError('--feature expects a feature id such as F012');
  }
  if (values.model !== undefined && !/^[\w.:-]+$/.test(values.model)) {
    throw new HarnessError('--model expects a model alias or name, such as sonnet');
  }
  return {
    plan: values.plan,
    once: values.once,
    maxSessions,
    feature: values.feature ?? null,
    noReview: values['no-review'],
    noMilestoneStop: values['no-milestone-stop'],
    noWait: values['no-wait'],
    model: values.model ?? null,
    dryRun: values['dry-run'],
    smoke: values.smoke,
    help: values.help,
  };
}

// ---------------------------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------------------------

function loadList(): FeatureList {
  if (!existsSync(PATHS.featureList)) return emptyFeatureList();
  const parsed = parseFeatureList(readFileSync(PATHS.featureList, 'utf8'));
  if (!parsed.ok) {
    throw new HarnessError(
      `harness/state/feature_list.json is invalid:\n  - ${parsed.errors.join('\n  - ')}\n` +
        'Fix it (npm run agents:check) and commit before running the harness.',
    );
  }
  return parsed.list;
}

function listAt(sha: string): FeatureList {
  const text = sha ? git.fileAt(sha, REL.featureList) : null;
  const parsed = text ? parseFeatureList(text) : null;
  return parsed?.ok ? parsed.list : emptyFeatureList();
}

/** The `status:` value in the front matter of docs/GAME_DESIGN.md. */
function designDocStatus(): string {
  if (!existsSync(PATHS.gameDesign)) return 'missing';
  const text = readFileSync(PATHS.gameDesign, 'utf8').replace(/\r\n/g, '\n');
  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  return /^status:\s*([\w-]+)/m.exec(frontMatter)?.[1]?.toLowerCase() ?? 'unknown';
}

function acquireLock(): () => void {
  if (existsSync(PATHS.lockFile)) {
    const pid = Number(readFileSync(PATHS.lockFile, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) {
      throw new HarnessError(
        `Another harness run is active (pid ${pid}). Stop it first, or delete harness/.lock if that process is gone.`,
      );
    }
  }
  writeFileSync(PATHS.lockFile, String(process.pid));
  const release = (): void => {
    try {
      if (readFileSync(PATHS.lockFile, 'utf8').trim() === String(process.pid))
        rmSync(PATHS.lockFile);
    } catch {
      // already gone
    }
  };
  process.on('exit', release);
  return release;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// ---------------------------------------------------------------------------------------------
// Preparing a session
// ---------------------------------------------------------------------------------------------

type SessionAction = Exclude<NextAction, { kind: 'complete' } | { kind: 'stuck' }>;

interface SessionPlan {
  number: number;
  role: Role;
  feature: Feature | null;
  planMode: 'initial' | 'extend' | null;
  /** HEAD before the session; everything after it is the session's work. */
  preHead: string;
  name: string;
  logPath: string;
  prompt: string;
}

const ROLE_FOR: Record<SessionAction['kind'], Role> = {
  plan: 'planner',
  build: 'builder',
  review: 'reviewer',
  maintain: 'maintainer',
};

function briefing(number: number, role: Role, list: FeatureList, runState: RunState): string {
  const k = counts(list);
  const lines = [
    `- Session ${number} · role: ${role} · branch: ${git.hasCommits() ? git.branch() : '(none)'}`,
    `- Features: ${k.done}/${k.total} done · ${k.needs_review} awaiting review · ${k.todo} todo · ${k.blocked} blocked`,
  ];
  for (const m of milestoneProgress(list)) {
    lines.push(
      `- Milestone ${m.id} "${m.title}": ${m.done}/${m.total} done${m.complete ? ' (complete)' : ''}`,
    );
  }
  const gate = runState.lastGate;
  if (gate?.ok)
    lines.push(`- The harness ran \`npm run verify\` after session ${gate.session}: it passed.`);
  if (gate && !gate.ok) {
    lines.push(
      `- The harness ran \`npm run verify\` after session ${gate.session}: it FAILED. Output tail:\n\n\`\`\`\n${gate.tail}\n\`\`\``,
    );
  }
  if (runState.lastViolations.length) {
    lines.push(
      `- After the previous session the harness had to correct these (don't repeat them):\n${runState.lastViolations.map((v) => `  - ${v}`).join('\n')}`,
    );
  }
  lines.push(`- Recent commits:\n\n\`\`\`\n${git.recentLog(8)}\n\`\`\``);
  return lines.join('\n');
}

function planSession(
  action: SessionAction,
  list: FeatureList,
  runState: RunState,
  cfg: HarnessConfig,
): SessionPlan {
  const role = ROLE_FOR[action.kind];
  const number = runState.sessions + 1;
  const feature = action.kind === 'build' || action.kind === 'review' ? action.feature : null;
  const planMode = action.kind === 'plan' ? action.mode : null;
  const base = feature ? runState.featureBase[feature.id] : undefined;
  const feedback = feature?.review_feedback.trim() ?? '';

  const prompt = renderPrompt(role, {
    SESSION: String(number),
    BRIEFING: briefing(number, role, list, runState),
    PLAN_MODE: planMode ?? '',
    FEATURE_ID: feature?.id ?? '',
    FEATURE_TITLE: feature?.title ?? '',
    FEATURE_JSON: feature ? JSON.stringify(feature, null, 2) : '',
    ATTEMPT: String((feature?.attempts ?? 0) + 1),
    MAX_ATTEMPTS: String(cfg.maxAttemptsPerFeature),
    DONE_STATUS: cfg.review ? 'needs_review' : 'done',
    REVIEW_FEEDBACK_BLOCK: feedback
      ? `\n**This feature was sent back.** Fix these problems first; they are why it isn't done yet:\n\n${feedback}\n`
      : '',
    REVIEW_RANGE: base ? `${git.shortSha(base)}..HEAD` : 'HEAD~1..HEAD',
  });

  const tag = `s${String(number).padStart(3, '0')}-${role}${feature ? `-${feature.id}` : ''}`;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  return {
    number,
    role,
    feature,
    planMode,
    preHead: git.hasCommits() ? git.head() : '',
    name: `flipper-${tag}`,
    logPath: join(PATHS.logs, `${tag}-${stamp}.jsonl`),
    prompt,
  };
}

// ---------------------------------------------------------------------------------------------
// After a session: commit, check, correct, record
// ---------------------------------------------------------------------------------------------

interface AfterSession {
  progressed: boolean;
  summary: string;
  /** Set when the run must stop for a human. */
  fatal: string | null;
}

/** Restore package.json gate scripts that a session changed. */
function guardGateScripts(preHead: string): string | null {
  const before = git.fileAt(preHead, REL.packageJson);
  if (!before || !existsSync(PATHS.packageJson)) return null;
  const pre = JSON.parse(before) as { scripts?: Record<string, string> };
  let post: { scripts?: Record<string, string> };
  try {
    post = JSON.parse(readFileSync(PATHS.packageJson, 'utf8')) as typeof post;
  } catch {
    git.restoreFrom(preHead, [REL.packageJson]);
    return 'package.json was left as invalid JSON (restored)';
  }
  const changed = GATE_SCRIPTS.filter((k) => pre.scripts?.[k] !== post.scripts?.[k]);
  if (!changed.length) return null;
  const scripts = { ...post.scripts };
  for (const key of changed) {
    const original = pre.scripts?.[key];
    if (original === undefined) delete scripts[key];
    else scripts[key] = original;
  }
  writeFileSync(PATHS.packageJson, `${JSON.stringify({ ...post, scripts }, null, 2)}\n`);
  return `changed the gate scripts in package.json: ${changed.join(', ')} (restored)`;
}

/** progress.md is append-only: if old entries were edited, restore them and keep the new lines. */
function guardProgressLog(preHead: string): string | null {
  const normalize = (s: string): string => s.replace(/\r\n/g, '\n');
  const before = normalize(git.fileAt(preHead, REL.progress) ?? '');
  const after = normalize(existsSync(PATHS.progress) ? readFileSync(PATHS.progress, 'utf8') : '');
  if (after.startsWith(before.trimEnd())) return null;
  const known = new Set(before.split('\n'));
  const added = after.split('\n').filter((line) => !known.has(line));
  writeFileSync(PATHS.progress, `${before.trimEnd()}\n\n${added.join('\n').trim()}\n`);
  return 'edited earlier entries in progress.md (restored them; kept the new lines)';
}

async function runGate(number: number, cfg: HarnessConfig): Promise<{ ok: boolean; tail: string }> {
  log.step('gate: npm run format');
  await runCommand('npm run format', 5 * 60_000);
  if (git.commitAll(`style: apply prettier [harness, session ${number}]`)) {
    log.step('gate: committed formatting fixes');
  }
  log.step('gate: npm run verify');
  const result = await runCommand('npm run verify', cfg.gateTimeoutMinutes * 60_000);
  const ok = result.code === 0 && !result.timedOut;
  if (ok) log.ok('gate: npm run verify passed');
  else log.warn(`gate: npm run verify ${result.timedOut ? 'timed out' : 'failed'}`);
  return { ok, tail: ok ? '' : tail(result.output, 60) };
}

async function afterSession(
  plan: SessionPlan,
  res: SessionResult,
  cfg: HarnessConfig,
  opts: { countAttempt: boolean; runGate: boolean },
): Promise<AfterSession> {
  const { role, feature, number, preHead } = plan;
  const violations: string[] = [];

  // 1. Never lose work: commit whatever the session left behind.
  if (
    git.commitAll(
      `wip${feature ? `(${feature.id})` : ''}: uncommitted work from session ${number} [harness]`,
    )
  ) {
    violations.push('ended with uncommitted changes (the harness committed them as WIP)');
  }

  // 2. History may only grow.
  if (!git.isAncestor(preHead, 'HEAD')) {
    return {
      progressed: false,
      summary: `session ${number} rewrote git history`,
      fatal: `Session ${number} rewrote git history: ${git.shortSha(preHead)} is no longer an ancestor of HEAD. Inspect \`git reflog\` before running the harness again.`,
    };
  }
  const newCommits = git.commitsSince(preHead);

  // 3. Protected files, gate scripts, and the append-only log.
  const toRestore = git.changedFiles(preHead).filter((path) => isProtected(path, role));
  if (toRestore.length) {
    git.restoreFrom(preHead, toRestore);
    violations.push(`changed files this role may not change: ${toRestore.join(', ')} (restored)`);
  }
  for (const problem of [guardGateScripts(preHead), guardProgressLog(preHead)]) {
    if (problem) violations.push(problem);
  }
  git.commitAll(`chore(harness): restore protected files after session ${number}`);

  // 4. Keep only the feature-list changes this role is allowed to make.
  const postText = existsSync(PATHS.featureList) ? readFileSync(PATHS.featureList, 'utf8') : null;
  const guarded = guardFeatureList({
    role,
    pre: listAt(preHead),
    postText,
    featureId: feature?.id,
    review: cfg.review,
  });
  violations.push(...guarded.violations);
  const list = guarded.list;
  const target = feature ? (list.features.find((f) => f.id === feature.id) ?? null) : null;

  // 5. The harness's own check of the build.
  const gate =
    opts.runGate && (role === 'builder' || role === 'maintainer')
      ? await runGate(number, cfg)
      : null;

  // 6. Bookkeeping.
  const runState = parseRunState(git.fileAt(preHead, REL.runState));
  runState.sessions = number;
  if (role === 'builder' && target) {
    runState.featureBase[target.id] ??= preHead;
    if (opts.countAttempt) target.attempts += 1;
    if (gate && !gate.ok && (target.status === 'needs_review' || target.status === 'done')) {
      target.status = 'todo';
      target.review_feedback = `The harness ran \`npm run verify\` after your session and it failed, so the feature went back to todo. Make it pass first. Output tail:\n${gate.tail}`;
    }
  }
  if (role === 'reviewer' && target?.status === 'done') target.review_feedback = '';
  if (target?.status === 'todo' && target.attempts >= cfg.maxAttemptsPerFeature) {
    target.status = 'blocked';
    target.notes =
      `${target.notes} [harness] Blocked after ${target.attempts} attempts; needs a human decision (see review_feedback).`.trim();
  }
  if (role === 'maintainer') runState.doneAtLastMaintenance = counts(list).done;
  if (gate) runState.lastGate = { session: number, ok: gate.ok, tail: gate.tail };
  runState.lastViolations = violations;

  const before = feature?.status ?? '';
  const after = target?.status ?? '';
  const cost = res.result?.total_cost_usd;
  const summary = [
    `session ${number} · ${role}${feature ? ` ${feature.id}` : ''}`,
    feature ? `${before} → ${after}` : null,
    res.outcome,
    gate ? `verify ${gate.ok ? 'passed' : 'FAILED'}` : null,
    `${newCommits.length} commit(s)`,
    `${res.toolCalls} tool calls`,
    formatDuration(res.durationMs),
    typeof cost === 'number' ? `~$${cost.toFixed(2)} API-equivalent` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  writeFileSync(PATHS.featureList, serializeFeatureList(list));
  saveRunState(runState);
  const notes = violations.length ? `\n> [harness] corrected: ${violations.join('; ')}` : '';
  appendFileSync(PATHS.progress, `\n> [harness] ${summary}${notes}\n`);
  git.commitAll(`chore(harness): ${summary}`);
  if (cfg.pushAfterSession) {
    const sync = git.syncWithUpstream();
    if (sync.ok) log.step(`git: ${sync.message}`);
    else log.warn(`git: ${sync.message} (the run continues; push by hand later)`);
  }

  let progressed: boolean;
  switch (role) {
    case 'planner':
      progressed = list.features.length > listAt(preHead).features.length;
      break;
    case 'builder':
      progressed = before !== after || (newCommits.length > 0 && gate?.ok !== false);
      break;
    case 'reviewer':
      progressed = before !== after;
      break;
    case 'maintainer':
      progressed = gate?.ok === true;
      break;
  }

  appendLedger({
    session: number,
    role,
    feature: feature?.id ?? null,
    outcome: res.outcome,
    detail: res.detail || undefined,
    statusBefore: before || undefined,
    statusAfter: after || undefined,
    gate: gate ? gate.ok : undefined,
    commits: newCommits.length,
    toolCalls: res.toolCalls,
    durationMs: res.durationMs,
    costUsd: cost,
    model: res.model,
    claudeSession: res.sessionId,
    violations,
  });
  for (const v of violations) log.warn(`corrected: ${v}`);
  return { progressed, summary, fatal: null };
}

// ---------------------------------------------------------------------------------------------
// Waiting, smoke test, dry run, summary
// ---------------------------------------------------------------------------------------------

async function waitUntil(when: Date, stopping: () => boolean): Promise<boolean> {
  const at = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  log.warn(
    `Waiting until ${at} (${formatDuration(when.getTime() - Date.now())}). Ctrl+C or create harness/STOP to stop.`,
  );
  while (Date.now() < when.getTime()) {
    if (stopping() || existsSync(PATHS.stopFile)) return false;
    await sleep(Math.min(30_000, when.getTime() - Date.now()));
  }
  return true;
}

/** Waits longer than this end the run instead (for example a weekly limit); run it again later. */
const MAX_WAIT_MS = 12 * 3_600_000;

const formatWhen = (date: Date): string =>
  date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** e.g. "usage when the session started: 5-hour window 36% (resets 15:00) · week 5% (resets Sat 10:00)" */
function describeUsage(limits: RateLimitInfo | null): string | null {
  if (!limits) return null;
  const part = (label: string, w: UsageWindow): string | null =>
    w.utilization === null
      ? null
      : `${label} ${Math.round(w.utilization * 100)}%${w.resetsAt ? ` (resets ${formatWhen(w.resetsAt)})` : ''}`;
  const parts = [part('5-hour window', limits.fiveHour), part('week', limits.sevenDay)].filter(
    Boolean,
  );
  return parts.length ? `usage when the session started: ${parts.join(' · ')}` : null;
}

/** Whether to wait for a usage reset before starting the next session, rather than be cut off midway. */
function usagePause(
  limits: RateLimitInfo | null,
  cfg: HarnessConfig,
): { window: string; percent: number; until: Date } | null {
  if (!limits || cfg.pauseAtUsagePercent === null) return null;
  const threshold = cfg.pauseAtUsagePercent / 100;
  const windows: [string, UsageWindow][] = [
    ['weekly', limits.sevenDay],
    ['5-hour', limits.fiveHour],
  ];
  for (const [window, w] of windows) {
    if (w.utilization !== null && w.utilization >= threshold && w.resetsAt) {
      if (w.resetsAt.getTime() > Date.now()) {
        return { window, percent: Math.round(w.utilization * 100), until: w.resetsAt };
      }
    }
  }
  return null;
}

async function smokeTest(cfg: HarnessConfig): Promise<number> {
  log.banner('Smoke test');
  const prompt = [
    'This is an automated check of the Flipper agent harness. Do exactly this:',
    '1. Run `node --version` with the Bash tool.',
    '2. Run `curl --version` with the Bash tool.',
    '3. Reply with exactly one line: node=<allowed|denied> curl=<allowed|denied>',
    'Do not read, create or change any files.',
  ].join('\n');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const res = await runClaudeSession({
    name: 'flipper-smoke',
    prompt,
    model: cfg.models.builder,
    effort: 'low',
    permissionMode: cfg.permissionMode,
    timeoutMs: 5 * 60_000,
    maxBudgetUsd: null,
    logPath: join(PATHS.logs, `smoke-${stamp}.jsonl`),
  });
  const answer = res.result?.result?.trim() ?? '';
  const cost = res.result?.total_cost_usd;
  log.info(
    `outcome: ${res.outcome}${res.detail ? ` (${res.detail})` : ''} · model: ${res.model ?? '?'} · ${formatDuration(res.durationMs)}${typeof cost === 'number' ? ` · ~$${cost.toFixed(3)} API-equivalent` : ''}`,
  );
  const usage = describeUsage(res.rateLimit);
  if (usage) log.info(usage);
  log.info(`answer: ${answer || '(none)'}`);
  const ok = res.outcome === 'ok' && /node=allowed/i.test(answer) && /curl=denied/i.test(answer);
  if (ok) log.ok('Headless Claude Code works and the harness permission rules are active.');
  else log.warn('Unexpected result. Look at the newest harness/logs/smoke-*.jsonl.');
  return ok ? 0 : 1;
}

function printDryRun(plan: SessionPlan, cfg: HarnessConfig): void {
  log.info(
    `role: ${plan.role}${plan.feature ? ` · feature ${plan.feature.id}` : ''}${plan.planMode ? ` · ${plan.planMode} plan` : ''}`,
  );
  log.info(
    `model: ${cfg.models[plan.role] ?? 'Claude Code default'} · effort: ${cfg.effort[plan.role] ?? 'default'} · permission mode: ${cfg.permissionMode}`,
  );
  log.info(`session name: ${plan.name}`);
  console.log(
    `\n${c.dim('──────── prompt ────────')}\n${plan.prompt}\n${c.dim('──────── end of prompt ────────')}`,
  );
  log.info('Dry run: nothing was executed.');
}

function printSummary(doneAtStart: number, sessionsRun: number): void {
  const list = loadList();
  const k = counts(list);
  log.banner('Summary');
  log.info(
    `${sessionsRun} session(s) this run · features done: ${doneAtStart} → ${k.done} of ${k.total}`,
  );
  for (const m of milestoneProgress(list)) {
    log.info(`${m.complete ? c.green('✔') : ' '} ${m.id} ${m.title}: ${m.done}/${m.total}`);
  }
  log.info('More detail: npm run agents:status · harness/state/progress.md · git log');
}

// ---------------------------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------------------------

async function loop(
  cli: Cli,
  cfg: HarnessConfig,
  signal: AbortSignal,
  stopping: () => boolean,
): Promise<number> {
  const startList = loadList();
  const completeAtStart = new Set(
    milestoneProgress(startList)
      .filter((m) => m.complete)
      .map((m) => m.id),
  );
  const doneAtStart = counts(startList).done;
  let sessionsRun = 0;
  let failures = 0;
  let limitWaits = 0;
  let transientWaits = 0;
  let exitCode = 0;
  let lastLimits: RateLimitInfo | null = null;

  while (true) {
    if (stopping()) break;
    if (existsSync(PATHS.stopFile)) {
      log.warn('Found harness/STOP: stopping. Delete that file to run again.');
      break;
    }
    if (sessionsRun >= cfg.maxSessions) {
      log.info(`Reached this run's session limit (${cfg.maxSessions}).`);
      break;
    }
    const pause = usagePause(lastLimits, cfg);
    if (pause) {
      log.warn(
        `Your ${pause.window} usage was at ${pause.percent}% (pauseAtUsagePercent: ${cfg.pauseAtUsagePercent}), so the next session waits for the reset instead of being cut off midway.`,
      );
      if (cli.noWait || pause.until.getTime() - Date.now() > MAX_WAIT_MS) {
        log.warn(
          `It resets ${formatWhen(pause.until)}. Stopping; run \`npm run agents\` again then.`,
        );
        break;
      }
      if (!(await waitUntil(new Date(pause.until.getTime() + 60_000), stopping))) break;
      lastLimits = null;
      continue;
    }

    const list = loadList();
    const runState = loadRunState();
    const maintenanceDue =
      cfg.maintenanceEvery > 0 &&
      counts(list).done - runState.doneAtLastMaintenance >= cfg.maintenanceEvery;
    const action: NextAction =
      cli.plan && sessionsRun === 0
        ? { kind: 'plan', mode: list.features.length ? 'extend' : 'initial' }
        : pickNext(list, { maintenanceDue, forceFeature: sessionsRun === 0 ? cli.feature : null });

    if (action.kind === 'complete') {
      log.ok(
        'Every feature is done. Extend docs/GAME_DESIGN.md and run `npm run agents -- --plan` to plan more.',
      );
      break;
    }
    if (action.kind === 'stuck') {
      log.warn(`Nothing can be built right now: ${action.reason}.`);
      log.info(
        'See `npm run agents:status`. To unblock a feature, clarify it and set its status to "todo" and attempts to 0.',
      );
      exitCode = 2;
      break;
    }
    if (action.kind === 'plan') {
      const status = designDocStatus();
      if (status !== 'ready') {
        const message = `docs/GAME_DESIGN.md says "status: ${status}". Describe the game there, then change it to "status: ready" so the planner can run.`;
        if (!cli.dryRun) throw new HarnessError(message);
        log.warn(message);
      }
    }

    const plan = planSession(action, list, runState, cfg);
    const title = plan.feature
      ? ` · ${plan.feature.id} ${plan.feature.title}`
      : plan.planMode
        ? ` · ${plan.planMode} plan`
        : '';
    log.banner(`Session ${plan.number} · ${plan.role}${title}`);
    if (cli.dryRun) {
      printDryRun(plan, cfg);
      return 0;
    }

    const res = await runClaudeSession({
      name: plan.name,
      prompt: plan.prompt,
      model: cfg.models[plan.role],
      effort: cfg.effort[plan.role],
      permissionMode: cfg.permissionMode,
      timeoutMs: cfg.sessionTimeoutMinutes * 60_000,
      maxBudgetUsd: cfg.maxBudgetUsdPerSession,
      logPath: plan.logPath,
      signal,
    });
    log.info(`session ended: ${res.outcome}${res.detail ? `: ${res.detail}` : ''}`);
    lastLimits = res.rateLimit ?? lastLimits;
    const usage = describeUsage(res.rateLimit);
    if (usage) log.info(usage);

    if (res.outcome === 'interrupted') {
      const after = await afterSession(plan, res, cfg, { countAttempt: false, runGate: false });
      log.info(after.summary);
      break;
    }

    if (res.outcome === 'usage_limit' || res.outcome === 'transient') {
      const touched = !git.isClean() || git.head() !== plan.preHead;
      if (touched)
        log.info(
          (await afterSession(plan, res, cfg, { countAttempt: false, runGate: true })).summary,
        );
      const isLimit = res.outcome === 'usage_limit';
      const waits = isLimit ? ++limitWaits : ++transientWaits;
      const maxWaits = isLimit ? cfg.maxUsageLimitWaits : 5;
      if (waits > maxWaits) {
        log.error(
          `Giving up after ${maxWaits} waits for ${isLimit ? 'usage limits to reset' : 'API errors to clear'}.`,
        );
        exitCode = 1;
        break;
      }
      const fallback = new Date(
        Date.now() + (isLimit ? cfg.usageLimitWaitMinutes : Math.min(2 ** waits, 15)) * 60_000,
      );
      const sane =
        res.resetAt &&
        res.resetAt.getTime() > Date.now() &&
        res.resetAt.getTime() - Date.now() < 8 * 86_400_000;
      const until = isLimit && sane ? new Date(res.resetAt!.getTime() + 2 * 60_000) : fallback;
      if ((isLimit && cli.noWait) || until.getTime() - Date.now() > MAX_WAIT_MS) {
        log.warn(
          `The usage limit resets ${formatWhen(until)}. Stopping; run \`npm run agents\` again then.`,
        );
        break;
      }
      if (!(await waitUntil(until, stopping))) break;
      lastLimits = null;
      continue;
    }

    limitWaits = 0;
    transientWaits = 0;
    sessionsRun++;
    const after = await afterSession(plan, res, cfg, { countAttempt: true, runGate: true });
    log.info(after.summary);
    if (after.fatal) {
      log.error(after.fatal);
      exitCode = 1;
      break;
    }

    failures = after.progressed ? 0 : failures + 1;
    if (failures >= cfg.maxConsecutiveFailures) {
      log.error(
        `${failures} sessions in a row made no progress. Stopping so a human can look: harness/state/progress.md, harness/logs/.`,
      );
      exitCode = 1;
      break;
    }
    if (plan.role === 'planner') {
      log.ok(
        'Planning done. Review harness/state/feature_list.json (edit it if you like, `npm run agents:check`, commit), then run `npm run agents`.',
      );
      break;
    }
    if (cfg.stopAtMilestones) {
      const finished = milestoneProgress(loadList()).filter(
        (m) => m.complete && !completeAtStart.has(m.id),
      );
      if (finished.length) {
        for (const m of finished) log.ok(`Milestone ${m.id} "${m.title}" is complete.`);
        log.info(
          'Play it with `npm run dev`. Adjust the design or the plan if needed, then run `npm run agents` to continue.',
        );
        break;
      }
    }
    if (cli.once) break;
    await sleep(cfg.pauseBetweenSessionsSeconds * 1000);
  }

  printSummary(doneAtStart, sessionsRun);
  return exitCode;
}

async function main(): Promise<number> {
  const cli = parseCli(process.argv.slice(2));
  if (cli.help) {
    console.log(HELP);
    return 0;
  }
  const cfg = loadConfig();
  if (cli.noReview) cfg.review = false;
  if (cli.noMilestoneStop) cfg.stopAtMilestones = false;
  if (cli.maxSessions !== null) cfg.maxSessions = cli.maxSessions;
  if (cli.model) for (const role of ROLES) cfg.models[role] = cli.model;
  if (cli.once) cfg.maxSessions = 1;

  log.banner('Flipper agent harness');
  const version = claudeVersion();
  if (!version) {
    throw new HarnessError(
      'Claude Code CLI not found. Install it (https://claude.com/claude-code) and sign in by running `claude` once. ' +
        'Set CLAUDE_BIN if it is installed somewhere unusual.',
    );
  }
  log.info(`Claude Code ${version}`);
  if (process.env.ANTHROPIC_API_KEY) {
    log.warn(
      'ANTHROPIC_API_KEY is set: sessions are billed to that API key, not your Claude subscription.',
    );
  }
  if (cli.smoke) return smokeTest(cfg);

  if (!cli.dryRun) {
    if (!git.hasCommits()) {
      throw new HarnessError(
        'This repository has no commits yet. Commit the project first: git add -A && git commit -m "Initial scaffold"',
      );
    }
    if (!git.isClean()) {
      throw new HarnessError(
        `The working tree has uncommitted changes. Commit or stash them first, so every change can be traced to a session:\n${git.status()}`,
      );
    }
    log.info(`branch ${git.branch()} at ${git.shortSha(git.head())}`);
  }

  const release = cli.dryRun ? null : acquireLock();
  const controller = new AbortController();
  let stopRequested = false;
  process.on('SIGINT', () => {
    if (stopRequested) {
      log.error('Forced exit.');
      process.exit(130);
    }
    stopRequested = true;
    log.warn(
      'Stopping: ending the current session and committing its work. Press Ctrl+C again to force.',
    );
    controller.abort();
  });

  try {
    return await loop(cli, cfg, controller.signal, () => stopRequested);
  } finally {
    release?.();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    if (err instanceof HarnessError) log.error(err.message);
    else console.error(err);
    process.exitCode = 1;
  },
);
