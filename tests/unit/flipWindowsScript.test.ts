import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/*
 * `npx tsx scripts/flip-windows.ts` is how agents and the human read the game's feel, so its shape
 * is tested: one row per water level from 10% to 90% with a single-flip window and a double-flip
 * window, each a window or "none"; then the difficulty benchmark (F020): the landing rates of the
 * practiced and the new player, the best fixed power and its rate, the best-scoring fixed power,
 * and each one's points per 10 throws; and a run time well under a minute. The numbers themselves are not checked here:
 * calibration.test.ts and difficulty.test.ts lock those.
 */

/** Run the script with `args` (tuning overrides) and return what it printed. */
function runScript(args: string[] = []) {
  const started = Date.now();
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/flip-windows.ts', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { run, seconds: (Date.now() - started) / 1000 };
}

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
    const { run, seconds } = runScript();
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

  it('then prints both landing rates, the best fixed power and its rate, and each player’s points per 10 throws', () => {
    const { run } = runScript();
    expect(run.status).toBe(0);
    const lines = run.stdout.trim().split(/\r?\n/);
    const start = lines.findIndex((line) => line.startsWith('difficulty benchmark'));
    expect(start).toBeGreaterThan(10); // after the table
    expect(lines[start]).toMatch(/200 random bottles, seed \d+, error σ 8 points/);
    expect(lines[start + 1]).toMatch(/player\s+landing rate\s+points per 10/);

    const practiced = lines[start + 2]!.match(/^practiced player .*?\s(\d+\.\d)%\s+(\d+\.\d)$/);
    const newPlayer = lines[start + 3]!.match(
      /^new player \(one fixed power, \d+(?:\.\d)?\)\s+(\d+\.\d)%\s+(\d+\.\d)$/,
    );
    const best = lines[start + 4]!.match(
      /^best fixed power \((\d+), no error\)\s+(\d+\.\d)%\s+(\d+\.\d)$/,
    );
    const scoring = lines[start + 5]!.match(
      /^best-scoring fixed power \((\d+), no error\)\s+(\d+\.\d)%\s+(\d+\.\d)$/,
    );
    expect(practiced, lines[start + 2]).not.toBeNull();
    expect(newPlayer, lines[start + 3]).not.toBeNull();
    expect(best, lines[start + 4]).not.toBeNull();
    expect(scoring, lines[start + 5]).not.toBeNull();
    // Rates are percentages; a fixed power is a power from 0 to 100; points are not negative.
    for (const rate of [practiced![1], newPlayer![1], best![2], scoring![2]]) {
      expect(Number(rate)).toBeGreaterThanOrEqual(0);
      expect(Number(rate)).toBeLessThanOrEqual(100);
    }
    for (const power of [best![1], scoring![1]]) expect(Number(power)).toBeLessThanOrEqual(100);
    for (const points of [practiced![2], newPlayer![2], best![3], scoring![3]]) {
      expect(Number(points)).toBeGreaterThanOrEqual(0);
    }
    // The best-scoring power scores at least what the most-landing one does.
    expect(Number(scoring![3])).toBeGreaterThanOrEqual(Number(best![3]));
    // The exact expected rates (free of the luck of the draw), then the expected points, come just
    // before the timing line.
    const expected = lines[lines.length - 3]!.match(
      /^expected landing rates, any seed \(aim \d+\.\d\): practiced (\d+\.\d)%, new player (\d+\.\d)%$/,
    );
    expect(expected, lines[lines.length - 3]).not.toBeNull();
    expect(Number(expected![1])).toBeGreaterThan(Number(expected![2])); // reading the water pays
    const points = lines[lines.length - 2]!.match(
      /^expected points per 10, same error: practiced (\d+\.\d\d), best fixed power \((\d+)\) (\d+\.\d\d)$/,
    );
    expect(points, lines[lines.length - 2]).not.toBeNull();
    expect(Number(points![1])).toBeGreaterThan(Number(points![3])); // and it scores more
    // The timing line closes the output.
    expect(lines[lines.length - 1]).toMatch(/^\(power 0 to 100 in steps of 1; [\d.]+ s\)$/);
  }, 70_000);

  it('takes tuning overrides as name=value, and refuses an unknown name', () => {
    // A heavier throw changes the table (a 10% bottle thrown 3 times as hard needs far less power).
    const normal = runScript().run.stdout.split(/\r?\n/)[2]!;
    const { run } = runScript(['throwLinearImpulse=30']);
    expect(run.status).toBe(0);
    expect(run.stdout.split(/\r?\n/)[2]!).not.toBe(normal);

    const bad = runScript(['notATuningValue=3']).run;
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('Unknown argument "notATuningValue=3"');
    expect(bad.stdout).toBe('');
  }, 70_000);
});
