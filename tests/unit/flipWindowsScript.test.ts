import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/*
 * `npx tsx scripts/flip-windows.ts` is how agents and the human read the game's feel, so its shape
 * is tested: one row per water level from 10% to 90% with a single-flip window and a double-flip
 * window, each a window or "none", and a run time well under a minute. The numbers themselves are
 * not checked here; F009 locks those.
 */

/** Read one window off the front of `cells`: `none`, or low, high, center and width. */
function takeWindow(cells: string[]): void {
  if (cells[0] === 'none') {
    cells.shift();
    return;
  }
  const [low, high, center, width] = cells.splice(0, 4).map(Number);
  expect([low, high, center, width].every(Number.isFinite)).toBe(true);
  expect(low).toBeGreaterThanOrEqual(0);
  expect(high).toBeLessThanOrEqual(100);
  expect(center).toBe((low + high) / 2);
  expect(width).toBe(high - low);
}

describe('scripts/flip-windows.ts', () => {
  it('prints one row per water level, 10% to 90%, each with a single and a double window or "none", in under a minute', () => {
    const started = Date.now();
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/flip-windows.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 60_000,
    });
    const seconds = (Date.now() - started) / 1000;
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(seconds).toBeLessThan(60);

    const lines = run.stdout.trim().split(/\r?\n/);
    expect(lines[0]).toContain('single flip');
    expect(lines[0]).toContain('double flip');
    const columns = ['low', 'high', 'center', 'width'];
    expect(lines[1].trim().split(/\s+/)).toEqual(['water', ...columns, ...columns]);

    const rows = lines.slice(2, 11);
    expect(rows.map((row) => row.trim().split(/\s+/)[0])).toEqual(
      [10, 20, 30, 40, 50, 60, 70, 80, 90].map((level) => `${level}%`),
    );
    for (const row of rows) {
      const cells = row.trim().split(/\s+/).slice(1);
      takeWindow(cells); // single flip
      takeWindow(cells); // double flip
      expect(cells).toEqual([]); // nothing else on the row
    }
  }, 70_000);
});
