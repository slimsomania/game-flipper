import { describe, expect, it, vi } from 'vitest';
import { findWindows, widestWindow, type SweepResult } from '../../src/core/flipWindow';

// findWindows is arithmetic on a list. If it ever built a Simulation, this test file would fail.
vi.mock('../../src/core/simulation', () => ({
  Simulation: class {
    constructor() {
      throw new Error('findWindows must not run physics');
    }
  },
}));

const win = (power: number, turns = 1): SweepResult => ({ power, result: 'success', turns });
const fail = (power: number, turns = 0): SweepResult => ({ power, result: 'fail', turns });
const range = (from: number, to: number, make: (power: number) => SweepResult): SweepResult[] =>
  Array.from({ length: to - from + 1 }, (_, i) => make(from + i));

describe('findWindows', () => {
  it('finds nothing in an empty list or when every throw fails', () => {
    expect(findWindows([])).toEqual([]);
    expect(findWindows(range(0, 100, (p) => fail(p, p < 50 ? 0 : 1)))).toEqual([]);
  });

  it('gives low, high, center and width of one window', () => {
    const results = [...range(0, 39, fail), ...range(40, 50, win), ...range(51, 100, fail)];
    expect(findWindows(results)).toEqual([{ turns: 1, low: 40, high: 50, center: 45, width: 10 }]);
  });

  it('finds several windows, from the lowest power up, each with its own turns', () => {
    const results = [
      ...range(0, 19, fail),
      ...range(20, 29, win),
      ...range(30, 49, fail),
      ...range(50, 55, (p) => win(p, 2)),
      ...range(56, 69, fail),
      ...range(70, 72, (p) => win(p, 3)),
      ...range(73, 100, fail),
    ];
    expect(findWindows(results)).toEqual([
      { turns: 1, low: 20, high: 29, center: 24.5, width: 9 },
      { turns: 2, low: 50, high: 55, center: 52.5, width: 5 },
      { turns: 3, low: 70, high: 72, center: 71, width: 2 },
    ]);
  });

  it('keeps two windows with the same turns apart when a failure lies between them', () => {
    const results = [...range(10, 14, win), fail(15), ...range(16, 18, win)];
    expect(findWindows(results)).toEqual([
      { turns: 1, low: 10, high: 14, center: 12, width: 4 },
      { turns: 1, low: 16, high: 18, center: 17, width: 2 },
    ]);
  });

  it('splits neighboring successes at a change of turns', () => {
    const results = [...range(30, 34, win), ...range(35, 38, (p) => win(p, 2))];
    expect(findWindows(results)).toEqual([
      { turns: 1, low: 30, high: 34, center: 32, width: 4 },
      { turns: 2, low: 35, high: 38, center: 36.5, width: 3 },
    ]);
  });

  it('finds a window that touches power 0', () => {
    const results = [...range(0, 8, (p) => win(p, 0)), ...range(9, 100, fail)];
    expect(findWindows(results)).toEqual([{ turns: 0, low: 0, high: 8, center: 4, width: 8 }]);
  });

  it('finds a window that touches power 100', () => {
    const results = [...range(0, 89, fail), ...range(90, 100, (p) => win(p, 3))];
    expect(findWindows(results)).toEqual([{ turns: 3, low: 90, high: 100, center: 95, width: 10 }]);
  });

  it('finds a window that covers the whole sweep', () => {
    expect(findWindows(range(0, 100, win))).toEqual([
      { turns: 1, low: 0, high: 100, center: 50, width: 100 },
    ]);
  });

  it('gives a window of one power a width of 0', () => {
    expect(findWindows([fail(4), win(5), fail(6)])).toEqual([
      { turns: 1, low: 5, high: 5, center: 5, width: 0 },
    ]);
  });

  it('works on results in any order, and leaves the list as it was', () => {
    const results = Object.freeze([win(12), fail(9), win(10), win(11), fail(13)]);
    expect(findWindows(results)).toEqual([{ turns: 1, low: 10, high: 12, center: 11, width: 2 }]);
    expect(results.map((r) => r.power)).toEqual([12, 9, 10, 11, 13]);
  });

  it('ignores the turns of a failure', () => {
    // A throw that lands on its side after one turn is not a single flip.
    expect(findWindows([fail(20, 1), win(21), fail(22, 1)])).toEqual([
      { turns: 1, low: 21, high: 21, center: 21, width: 0 },
    ]);
  });
});

describe('widestWindow', () => {
  const windows = findWindows([
    ...range(10, 12, win),
    fail(13),
    ...range(20, 29, win),
    fail(30),
    ...range(40, 49, (p) => win(p, 2)),
    ...range(50, 59, fail),
  ]);

  it('picks the widest window with the given turns, 1 by default', () => {
    expect(widestWindow(windows)).toMatchObject({ turns: 1, low: 20, high: 29 });
    expect(widestWindow(windows, 2)).toMatchObject({ turns: 2, low: 40, high: 49 });
  });

  it('keeps the first of two equally wide windows', () => {
    const equal = findWindows([...range(10, 14, win), fail(15), ...range(20, 24, win)]);
    expect(widestWindow(equal)).toMatchObject({ low: 10 });
  });

  it('gives null when no window has those turns', () => {
    expect(widestWindow(windows, 3)).toBeNull();
    expect(widestWindow([])).toBeNull();
  });
});
