import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './paths';

const MAX_BUFFER = 64 * 1024 * 1024;

export function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  }).replace(/\s+$/, '');
}

function succeeds(args: string[]): boolean {
  return spawnSync('git', args, { cwd: REPO_ROOT, stdio: 'ignore' }).status === 0;
}

export const hasCommits = (): boolean => succeeds(['rev-parse', '--verify', '--quiet', 'HEAD']);
export const head = (): string => git(['rev-parse', 'HEAD']);
export const shortSha = (sha: string): string => sha.slice(0, 8);
export const branch = (): string => git(['rev-parse', '--abbrev-ref', 'HEAD']);
export const status = (): string => git(['status', '--porcelain']);
export const isClean = (): boolean => status() === '';
export const isAncestor = (ancestor: string, of: string): boolean =>
  succeeds(['merge-base', '--is-ancestor', ancestor, of]);

export function recentLog(count: number): string {
  return hasCommits() ? git(['log', '--oneline', `-${count}`]) : '(no commits yet)';
}

/** Stage everything and commit. Returns false when there was nothing to commit. */
export function commitAll(message: string): boolean {
  git(['add', '-A']);
  if (succeeds(['diff', '--cached', '--quiet'])) return false;
  git(['commit', '-q', '-m', message]);
  return true;
}

export function changedFiles(from: string, to = 'HEAD'): string[] {
  const out = git(['diff', '--name-only', from, to]);
  return out ? out.split('\n') : [];
}

export function commitsSince(from: string): string[] {
  const out = git(['log', '--format=%h %s', `${from}..HEAD`]);
  return out ? out.split('\n') : [];
}

/** File content at a commit, or null if it didn't exist there. */
export function fileAt(sha: string, path: string): string | null {
  const result = spawnSync('git', ['show', `${sha}:${path}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
  return result.status === 0 ? result.stdout : null;
}

/** Put files back the way they were at `sha`; files that didn't exist then are deleted. */
export function restoreFrom(sha: string, paths: string[]): void {
  for (const path of paths) {
    if (fileAt(sha, path) !== null) {
      git(['checkout', sha, '--', path]);
    } else {
      git(['rm', '-q', '-f', '--ignore-unmatch', '--', path]);
      const absolute = join(REPO_ROOT, path);
      if (existsSync(absolute)) rmSync(absolute, { force: true });
    }
  }
}
