import { beforeAll, describe, expect, it } from 'vitest';
import {
  findWindows,
  sweepPowers,
  widestWindow,
  type FlipWindow,
  type SweepPoint,
} from '../../src/core/flipWindow';
import { bottleExtent } from '../../src/core/outcome';
import { Simulation } from '../../src/core/simulation';
import { TABLE_LEFT_X, TABLE_RIGHT_X, TABLE_TOP_Y } from '../../src/core/table';
import { MAX_POWER } from '../../src/core/throw';
import { run } from './helpers';

/*
 * Calibration of the default throw (F009, targets raised in F020). These tests lock the design's
 * targets (section 3 of docs/GAME_DESIGN.md), not particular tuning values: window widths, how
 * the windows move with the water, how far apart the empty and the full bottle are, that no fixed
 * power lands most bottles, and what too little or too much power does. Retuning inside the
 * targets needs no change here. Everything runs the real Simulation through `flipWindow.ts` with
 * `DEFAULT_TUNING`.
 */

const STARTED = Date.now();
/** The water levels of the design's targets: 10% to 90% in 10% steps. */
const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const ONE_TURN = 2 * Math.PI;

interface Level {
  water: number;
  points: SweepPoint[];
  single: FlipWindow | null;
  double: FlipWindow | null;
}

let levels: Level[] = [];

// The sweeps are the whole cost of this file (909 throws). The generous hook timeout only keeps a
// slow or busy machine from failing with a timeout; the 15 s budget is checked by its own test.
beforeAll(() => {
  levels = LEVELS.map((water) => {
    const points = sweepPowers(water);
    const windows = findWindows(points);
    return { water, points, single: widestWindow(windows, 1), double: widestWindow(windows, 2) };
  });
}, 120_000);

/** The tested level with this water (0.1 to 0.9). */
function levelAt(water: number): Level {
  const level = levels.find((l) => Math.abs(l.water - water) < 1e-9);
  expect(level, `a tested level at ${water} water`).toBeDefined();
  return level!;
}

/** A level's water as a readable label for failure messages, such as "30% water". */
const labelOf = (level: Level): string => `${Math.round(level.water * 100)}% water`;

/** The single-flip window of a level; fails the test with the level named if there is none. */
function singleOf(level: Level): FlipWindow {
  expect(level.single, `a single-flip window at ${labelOf(level)}`).not.toBeNull();
  return level.single!;
}

function doubleOf(level: Level): FlipWindow {
  expect(level.double, `a double-flip window at ${labelOf(level)}`).not.toBeNull();
  return level.double!;
}

describe('single-flip windows of the default tuning', () => {
  // Design section 3: a window at least 10 points wide. The upper end is the test's own sanity
  // limit: a window wider than 28 would let one fixed power land too many bottles.
  it('every tested water level has a window 10 to 28 points wide', () => {
    for (const level of levels) {
      const { width } = singleOf(level);
      expect(width, labelOf(level)).toBeGreaterThanOrEqual(10);
      expect(width, labelOf(level)).toBeLessThanOrEqual(28);
    }
  });

  it('the window centers rise with the water level', () => {
    const centers = levels.map((level) => singleOf(level).center);
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i], labelOf(levels[i]!)).toBeGreaterThan(centers[i - 1]!);
    }
  });

  // Design section 3, as changed on 2026-11-18 (F020): 2.5 to 4 times, up from 1.5 to 2 times, so
  // that the water level matters. These ranges follow the design change.
  it('a nearly full bottle needs 2.5 to 4.0 times the power of a nearly empty one', () => {
    const ratio = singleOf(levelAt(0.9)).center / singleOf(levelAt(0.1)).center;
    expect(ratio).toBeGreaterThanOrEqual(2.5);
    expect(ratio).toBeLessThanOrEqual(4.0);
  });

  it('the windows of the 10% and the 90% bottle do not overlap', () => {
    const empty = singleOf(levelAt(0.1));
    const full = singleOf(levelAt(0.9));
    expect(empty.high).toBeLessThan(full.low);
  });

  // Design section 3: "No single fixed power may land a single flip on more than about 60% of
  // water levels", so reading the water matters. Over the 9 levels that is at most 5 (55.6%); 6
  // would be 66.7%.
  it('no fixed power from 0 to 100 lands a single flip on more than 60% of the water levels', () => {
    let worst = { power: 0, share: 0 };
    for (let power = 0; power <= MAX_POWER; power++) {
      const landed = levels.filter((level) => {
        const point = level.points[power]!;
        return point.result === 'success' && point.turns === 1;
      }).length;
      const share = landed / levels.length;
      if (share > worst.share) worst = { power, share };
    }
    expect(
      worst.share,
      `power ${worst.power} lands a single flip on ${Math.round(worst.share * 100)}% of the levels`,
    ).toBeLessThanOrEqual(0.6);
  });

  it('too little power under-rotates and too much over-rotates', () => {
    for (const level of levels) {
      const { low, high } = singleOf(level);
      const label = labelOf(level);
      if (low - 10 >= 0) {
        const rotation = level.points[low - 10]!.rotation;
        expect(rotation, `${label} at power ${low - 10}`).toBeLessThan(ONE_TURN);
      }
      if (high + 10 <= MAX_POWER) {
        const rotation = level.points[high + 10]!.rotation;
        expect(rotation, `${label} at power ${high + 10}`).toBeGreaterThan(ONE_TURN);
      }
    }
  });
});

describe('double-flip windows of the default tuning', () => {
  it('every tested water level has one, at least 4 points wide and narrower than the single', () => {
    for (const level of levels) {
      const double = doubleOf(level);
      expect(double.width, labelOf(level)).toBeGreaterThanOrEqual(4);
      expect(double.width, labelOf(level)).toBeLessThan(singleOf(level).width);
      expect(double.high, labelOf(level)).toBeLessThanOrEqual(MAX_POWER);
    }
  });

  // The window begins below the top of the bar, so a player can reach it by aiming (a window that
  // began at 100 would be a single lucky value).
  it('every double-flip window starts below power 100', () => {
    for (const level of levels) {
      expect(doubleOf(level).low, labelOf(level)).toBeLessThan(MAX_POWER);
    }
  });

  it('every double-flip window lies entirely above its single-flip window', () => {
    for (const level of levels) {
      expect(doubleOf(level).low, labelOf(level)).toBeGreaterThan(singleOf(level).high);
    }
  });
});

describe('the flight at the 50% bottle’s window centers', () => {
  /** Throw at the whole power nearest `center` (inside the window) and watch every step. */
  function fly(center: number) {
    const power = Math.round(center);
    const sim = new Simulation({ seed: 1 });
    sim.setWater(0.5);
    sim.throwBottle(power);
    let highest = Infinity; // smallest y of any point of the bottle: the top of the screen is 0
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < 400 && sim.phase === 'flying'; i++) {
      sim.step();
      const { x, y, angle } = sim.snapshot().bottle;
      const box = bottleExtent(x, y, angle);
      highest = Math.min(highest, box.minY);
      left = Math.min(left, box.minX);
      right = Math.max(right, box.maxX);
    }
    const snapshot = sim.snapshot();
    return { thrownAt: power, highest, left, right, ...snapshot };
  }

  for (const [name, pick] of [
    ['single-flip', (level: Level) => singleOf(level)],
    ['double-flip', (level: Level) => doubleOf(level)],
  ] as const) {
    it(`a throw at the ${name} window center stays on screen and lands on the table`, () => {
      const flight = fly(pick(levelAt(0.5)).center);
      expect(flight.highest, 'the top of the bottle never goes above the screen').toBeGreaterThan(
        0,
      );
      expect(flight.left).toBeGreaterThan(0);
      expect(flight.right).toBeLessThan(TABLE_RIGHT_X + 1);
      // It comes to rest on the table: its base is on the tabletop, inside the table's ends.
      expect(flight.outcome).toMatchObject({ result: 'success' });
      expect(flight.bottle.x).toBeGreaterThan(TABLE_LEFT_X);
      expect(flight.bottle.x).toBeLessThan(TABLE_RIGHT_X);
      expect(flight.bottle.y).toBeCloseTo(TABLE_TOP_Y, 1);
    });
  }
});

describe('a throw is only its launch', () => {
  it('nothing moves or turns the bottle after release: the launch velocities alone give the same flight', () => {
    for (const level of levels) {
      const power = Math.round(singleOf(level).center);
      const thrown = new Simulation({ seed: 3 });
      thrown.setWater(level.water);
      thrown.throwBottle(power);
      const launch = thrown.snapshot().bottle;

      // The same bottle placed at the hand with the velocities the throw gave it, then left alone.
      const placed = new Simulation({ seed: 3 });
      placed.setWater(level.water);
      placed.placeBottle({
        x: launch.x,
        y: launch.y,
        angle: launch.angle,
        vx: launch.vx,
        vy: launch.vy,
        omega: launch.omega,
      });
      run(thrown, 120);
      run(placed, 120);
      expect(placed.snapshot().bottle, labelOf(level)).toEqual(thrown.snapshot().bottle);
    }
  });
});

describe('the calibration tests', () => {
  it('take under 15 seconds together', () => {
    expect(Date.now() - STARTED).toBeLessThan(15_000);
  });
});
