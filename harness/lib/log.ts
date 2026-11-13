import { appendFileSync, mkdirSync } from 'node:fs';
import { PATHS } from './paths';

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint =
  (code: string) =>
  (text: string): string =>
    useColor ? `\x1b[${code}m${text}\x1b[0m` : text;

export const c = {
  bold: paint('1'),
  dim: paint('2'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  cyan: paint('36'),
};

const time = (): string => new Date().toLocaleTimeString([], { hour12: false });

export const log = {
  info: (msg: string): void => console.log(`${c.dim(time())}  ${msg}`),
  step: (msg: string): void => console.log(`${c.dim(time())}  ${c.dim('·')} ${msg}`),
  ok: (msg: string): void => console.log(`${c.dim(time())}  ${c.green('✔')} ${msg}`),
  warn: (msg: string): void => console.log(`${c.dim(time())}  ${c.yellow('!')} ${msg}`),
  error: (msg: string): void => console.error(`${c.dim(time())}  ${c.red('✖')} ${msg}`),
  banner: (msg: string): void => console.log(`\n${c.bold(c.cyan(`━━ ${msg} ━━`))}`),
};

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

/** Last `lines` lines of some command output, without colors. */
export function tail(text: string, lines: number): string {
  return stripAnsi(text).replace(/\r\n/g, '\n').trimEnd().split('\n').slice(-lines).join('\n');
}

export function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** One JSON line per session in harness/logs/ledger.jsonl (local only, not committed). */
export function appendLedger(entry: Record<string, unknown>): void {
  mkdirSync(PATHS.logs, { recursive: true });
  appendFileSync(PATHS.ledger, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}
