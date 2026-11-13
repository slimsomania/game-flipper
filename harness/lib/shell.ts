import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { REPO_ROOT } from './paths';

export const IS_WINDOWS = process.platform === 'win32';

export interface CommandResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

/** Run a command line (e.g. "npm run verify") in the repo, capturing stdout and stderr together. */
export function runCommand(commandLine: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(commandLine, {
      cwd: REPO_ROOT,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
      detached: !IS_WINDOWS,
    });
    let output = '';
    let timedOut = false;
    const collect = (chunk: Buffer): void => {
      output += chunk.toString();
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    child.on('error', (err) => {
      output += `\n${err.message}`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });
}

/** Kill a process and everything it started. */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM'); // the whole process group (spawned with detached: true)
  } catch {
    child.kill('SIGTERM');
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
