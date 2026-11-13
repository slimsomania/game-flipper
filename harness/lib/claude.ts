/*
 * Runs one headless Claude Code session (`claude -p --output-format stream-json`), streams a
 * compact view of it to the console, saves the raw event stream to a log file, and classifies
 * how it ended (ok, usage limit, transient API error, error, timeout, interrupted).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { c, log, oneLine } from './log';
import { REL, REPO_ROOT } from './paths';
import { IS_WINDOWS, killTree } from './shell';

export interface SessionSpec {
  /** Session name shown in `claude --resume`, e.g. flipper-s012-builder-F012. */
  name: string;
  prompt: string;
  model: string | null;
  effort: string | null;
  permissionMode: string;
  timeoutMs: number;
  maxBudgetUsd: number | null;
  logPath: string;
  signal?: AbortSignal;
}

export type SessionOutcome =
  'ok' | 'usage_limit' | 'transient' | 'error' | 'timeout' | 'interrupted';

/** The final `result` event of a stream-json session (the fields we use; all optional). */
export interface ResultEvent {
  type: 'result';
  subtype?: string;
  is_error?: boolean;
  result?: string;
  duration_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  session_id?: string;
  api_error_status?: number | null;
  permission_denials?: { tool_name?: string; tool_input?: unknown }[];
}

export interface UsageWindow {
  /** Fraction of the window used, 0..1. */
  utilization: number | null;
  resetsAt: Date | null;
}

/** Usage-limit status from Claude Code's `rate_limit_event` (reported for subscription accounts). */
export interface RateLimitInfo {
  /** "allowed" while within limits. */
  status: string;
  /** The window the status refers to, e.g. "five_hour". */
  type: string | null;
  resetsAt: Date | null;
  fiveHour: UsageWindow;
  sevenDay: UsageWindow;
}

export interface SessionResult {
  outcome: SessionOutcome;
  /** Short explanation when the outcome isn't ok. */
  detail: string;
  exitCode: number | null;
  result: ResultEvent | null;
  model: string | null;
  sessionId: string | null;
  toolCalls: number;
  durationMs: number;
  /** When a usage limit resets, if known. */
  resetAt: Date | null;
  /** The latest usage-limit status reported during the session. */
  rateLimit: RateLimitInfo | null;
}

/** Arguments must be plain tokens: on Windows they are joined into a shell command line. */
const SAFE_ARG = /^[\w.:/=@-]+$/;

export const claudeBin = (): string => process.env.CLAUDE_BIN || 'claude';

function windowsCommandLine(args: string[]): string {
  const bin = claudeBin();
  return [/[\s&()^|<>]/.test(bin) ? `"${bin}"` : bin, ...args].join(' ');
}

/** `claude --version`, or null if the CLI can't be started. */
export function claudeVersion(): string | null {
  const result = IS_WINDOWS
    ? spawnSync(windowsCommandLine(['--version']), { shell: true, encoding: 'utf8' })
    : spawnSync(claudeBin(), ['--version'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function buildArgs(spec: SessionSpec): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    spec.permissionMode,
    // Nobody is around to answer a permission prompt: anything not pre-approved is refused.
    '--permission-prompts',
    'none',
    '--settings',
    REL.claudeSettings,
    '--name',
    spec.name,
  ];
  if (spec.model) args.push('--model', spec.model);
  if (spec.effort) args.push('--effort', spec.effort);
  if (spec.maxBudgetUsd !== null) args.push('--max-budget-usd', String(spec.maxBudgetUsd));
  for (const arg of args) {
    if (!SAFE_ARG.test(arg)) {
      throw new Error(`Refusing to pass an unusual argument to claude: ${arg}`);
    }
  }
  return args;
}

/** Read a `rate_limit_event` from the stream. */
export function parseRateLimitEvent(event: Record<string, unknown>): RateLimitInfo | null {
  const info = event.rate_limit_info;
  if (typeof info !== 'object' || info === null) return null;
  const fields = info as Record<string, unknown>;
  const windows = (
    typeof fields.unifiedWindows === 'object' && fields.unifiedWindows !== null
      ? fields.unifiedWindows
      : {}
  ) as Record<string, Record<string, unknown> | undefined>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const date = (v: unknown): Date | null => {
    const seconds = num(v);
    return seconds === null ? null : new Date(seconds * 1000);
  };
  const usageWindow = (w: Record<string, unknown> | undefined): UsageWindow => ({
    utilization: num(w?.utilization),
    resetsAt: date(w?.resetsAt),
  });
  return {
    status: typeof fields.status === 'string' ? fields.status : 'unknown',
    type: typeof fields.rateLimitType === 'string' ? fields.rateLimitType : null,
    resetsAt: date(fields.resetsAt),
    fiveHour: usageWindow(windows.five_hour),
    sevenDay: usageWindow(windows.seven_day),
  };
}

const USAGE_LIMIT =
  /usage limit|limit reached|hit your (?:usage )?limit|limit will reset|out of (?:extra )?usage|weekly limit|session limit|rate.?limit/i;
const TRANSIENT =
  /overloaded|\b529\b|\b50[0234]\b|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network error|fetch failed/i;

export function classifyOutcome(
  result: ResultEvent | null,
  stderr: string,
  exitCode: number | null,
  timedOut: boolean,
  interrupted: boolean,
  rateLimit: RateLimitInfo | null = null,
): { outcome: SessionOutcome; detail: string } {
  if (interrupted) return { outcome: 'interrupted', detail: 'stopped with Ctrl+C' };
  if (timedOut) return { outcome: 'timeout', detail: 'the session hit its time limit' };
  const failed = !result || result.is_error === true || result.subtype !== 'success';
  if (!failed) return { outcome: 'ok', detail: '' };
  const text = `${result?.result ?? ''}\n${stderr}`;
  const limited = rateLimit !== null && !rateLimit.status.startsWith('allowed');
  if (limited || USAGE_LIMIT.test(text)) {
    return {
      outcome: 'usage_limit',
      detail: oneLine(text, 200) || `usage limit (${rateLimit?.type ?? 'unknown window'})`,
    };
  }
  const status = result?.api_error_status;
  if (TRANSIENT.test(text) || (typeof status === 'number' && (status === 429 || status >= 500))) {
    return { outcome: 'transient', detail: oneLine(text, 200) || `API error ${status}` };
  }
  const detail = result
    ? `${result.subtype ?? 'error'}: ${result.result ?? ''}`
    : stderr || `claude exited with code ${exitCode}`;
  return { outcome: 'error', detail: oneLine(detail, 300) };
}

/** Find a reset time in a usage-limit message: "…|1767225600" (epoch) or "resets 3pm" / "resets at 15:30". */
export function parseResetTime(text: string, now = new Date()): Date | null {
  const epoch = /\|(\d{10})\b/.exec(text);
  if (epoch) return new Date(Number(epoch[1]) * 1000);
  const match = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  const at = new Date(now);
  at.setHours(hour, minute, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  return at;
}

function describeTool(name: string, input: unknown): string {
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const raw =
    fields.command ??
    fields.file_path ??
    fields.path ??
    fields.pattern ??
    fields.url ??
    fields.query ??
    fields.description ??
    '';
  let text = String(raw);
  if (isAbsolute(text)) text = relative(REPO_ROOT, text).replace(/\\/g, '/');
  return oneLine(text, 110) || name;
}

export function runClaudeSession(spec: SessionSpec): Promise<SessionResult> {
  const started = Date.now();
  const args = buildArgs(spec);
  mkdirSync(dirname(spec.logPath), { recursive: true });
  const logFile = createWriteStream(spec.logPath, { flags: 'a' });

  // On Windows `claude` is usually an npm .cmd shim, which needs a shell; the arguments were
  // checked above, so joining them into one command line is safe.
  const child = IS_WINDOWS
    ? spawn(windowsCommandLine(args), {
        cwd: REPO_ROOT,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    : spawn(claudeBin(), args, { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'], detached: true });

  let result: ResultEvent | null = null;
  let rateLimit: RateLimitInfo | null = null;
  let model: string | null = null;
  let sessionId: string | null = null;
  let toolCalls = 0;
  let stderr = '';
  let timedOut = false;
  let interrupted = false;

  const handle = (event: Record<string, unknown>): void => {
    if (event.type === 'system' && event.subtype === 'init') {
      model = typeof event.model === 'string' ? event.model : null;
      sessionId = typeof event.session_id === 'string' ? event.session_id : null;
      log.step(`claude session ${sessionId ?? '?'} · model ${model ?? 'default'}`);
    } else if (event.type === 'system' && event.subtype === 'permission_denied') {
      log.step(`${c.yellow('denied')} ${oneLine(String(event.message ?? event.tool_name), 120)}`);
    } else if (event.type === 'rate_limit_event') {
      rateLimit = parseRateLimitEvent(event) ?? rateLimit;
    } else if (event.type === 'assistant') {
      const message = event.message as { content?: unknown } | undefined;
      const blocks = Array.isArray(message?.content)
        ? (message.content as Record<string, unknown>[])
        : [];
      for (const block of blocks) {
        if (block.type === 'tool_use') {
          toolCalls++;
          const name = String(block.name);
          log.step(`${c.cyan(name.padEnd(5))} ${describeTool(name, block.input)}`);
        } else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          log.step(c.dim(`"${oneLine(block.text, 140)}"`));
        }
      }
    } else if (event.type === 'result') {
      result = event as unknown as ResultEvent;
    }
  };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, spec.timeoutMs);
    const onAbort = (): void => {
      interrupted = true;
      killTree(child);
    };
    spec.signal?.addEventListener('abort', onAbort, { once: true });

    createInterface({ input: child.stdout }).on('line', (line) => {
      logFile.write(`${line}\n`);
      try {
        handle(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Not JSON (shouldn't happen with stream-json); it's in the log file anyway.
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-8000);
      logFile.write(`[stderr] ${text}`);
    });
    child.on('error', (err) => {
      stderr += `\n${err.message}`;
    });
    child.stdin.on('error', () => {
      // claude exited before reading the prompt; the exit code and stderr explain why.
    });
    child.stdin.end(spec.prompt);

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      spec.signal?.removeEventListener('abort', onAbort);
      logFile.end();
      const final = result as ResultEvent | null;
      const limits = rateLimit as RateLimitInfo | null;
      const { outcome, detail } = classifyOutcome(
        final,
        stderr,
        exitCode,
        timedOut,
        interrupted,
        limits,
      );
      if (final?.result && outcome === 'ok') {
        log.step(c.dim(`final: "${oneLine(final.result, 300)}"`));
      }
      resolve({
        outcome,
        detail,
        exitCode,
        result: final,
        model,
        sessionId,
        toolCalls,
        durationMs: Date.now() - started,
        resetAt:
          outcome === 'usage_limit'
            ? (limits?.resetsAt ?? parseResetTime(`${final?.result ?? ''}\n${stderr}`))
            : null,
        rateLimit: limits,
      });
    });
  });
}
