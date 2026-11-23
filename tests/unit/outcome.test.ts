import { describe, expect, it } from 'vitest';
import { BOTTLE_BODY_WIDTH, BOTTLE_HEIGHT } from '../../src/core/bottleShape';
import { WORLD_HEIGHT_M, WORLD_WIDTH_M } from '../../src/core/constants';
import {
  LandingJudge,
  bottleExtent,
  tiltFromUpright,
  wrapAngle,
  type LandingSample,
} from '../../src/core/outcome';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../../src/core/table';
import { DEFAULT_TUNING, resolveTuning, type Tuning } from '../../src/core/tuning';

// The judge's rules on their own. `landingJudging.test.ts` and `placeBottle.test.ts` run it in a
// Simulation.

const TWO_PI = Math.PI * 2;
const deg = (degrees: number): number => (degrees * Math.PI) / 180;
const HALF_WIDTH = BOTTLE_BODY_WIDTH / 2;

describe('wrapAngle and tiltFromUpright', () => {
  it('removes whole turns and keeps the direction', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(TWO_PI)).toBeCloseTo(0, 12);
    expect(wrapAngle(-TWO_PI)).toBeCloseTo(0, 12);
    expect(wrapAngle(3 * TWO_PI + 0.5)).toBeCloseTo(0.5, 9);
    expect(wrapAngle(-3 * TWO_PI - 0.5)).toBeCloseTo(-0.5, 9);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it('measures the tilt from upright as 0 to π, whichever way and however many turns', () => {
    expect(tiltFromUpright(0)).toBe(0);
    expect(tiltFromUpright(deg(10))).toBeCloseTo(deg(10), 12);
    expect(tiltFromUpright(deg(-10))).toBeCloseTo(deg(10), 12);
    expect(tiltFromUpright(TWO_PI + deg(10))).toBeCloseTo(deg(10), 9);
    expect(tiltFromUpright(-2 * TWO_PI - deg(10))).toBeCloseTo(deg(10), 9);
    expect(tiltFromUpright(deg(350))).toBeCloseTo(deg(10), 9);
    expect(tiltFromUpright(Math.PI)).toBeCloseTo(Math.PI, 12);
  });
});

describe('bottleExtent', () => {
  it('is the base width by the bottle height when upright, standing on its base at y', () => {
    const box = bottleExtent(5, 4, 0);
    expect(box.minX).toBeCloseTo(5 - HALF_WIDTH, 12);
    expect(box.maxX).toBeCloseTo(5 + HALF_WIDTH, 12);
    expect(box.maxY).toBeCloseTo(4, 12);
    expect(box.minY).toBeCloseTo(4 - BOTTLE_HEIGHT, 12);
  });

  it('turns with the bottle: on its side it is as wide as the bottle is tall', () => {
    const side = bottleExtent(5, 4, Math.PI / 2); // clockwise: the cap points right
    expect(side.maxX - side.minX).toBeCloseTo(BOTTLE_HEIGHT, 12);
    expect(side.maxY - side.minY).toBeCloseTo(BOTTLE_BODY_WIDTH, 12);
    expect(side.maxX).toBeCloseTo(5 + BOTTLE_HEIGHT, 12);
    const upsideDown = bottleExtent(5, 4, Math.PI);
    expect(upsideDown.maxY).toBeCloseTo(4 + BOTTLE_HEIGHT, 12);
    expect(upsideDown.minY).toBeCloseTo(4, 12);
  });
});

describe('LandingJudge (synthetic samples)', () => {
  /** A bottle at rest on the table at `angle`, lowest point on the tabletop. */
  function resting(angle: number, over: Partial<LandingSample> = {}): LandingSample {
    return {
      x: TABLE_CENTER_X,
      y: TABLE_TOP_Y - bottleExtent(0, 0, angle).maxY,
      angle,
      vx: 0,
      vy: 0,
      omega: 0,
      onTable: true,
      ...over,
    };
  }

  function feed(judge: LandingJudge, steps: number, sample: LandingSample) {
    let outcome = judge.outcome;
    for (let i = 0; i < steps; i++) outcome = judge.observe(sample);
    return outcome;
  }

  const judge = (tuning: Partial<Tuning> = {}, releaseAngle = 0, creditedTurns = 0) =>
    new LandingJudge(resolveTuning(tuning), releaseAngle, creditedTurns);
  /**
   * A judge that counts one turn as made, so resting upright is a success: a landing needs a full
   * turn (`tests/unit/flipRule.test.ts` covers that rule itself).
   */
  const flipped = (tuning: Partial<Tuning> = {}) => judge(tuning, 0, 1);

  it('needs the full hold time standing upright, on the table and nearly still: 0.5 s, 30 steps', () => {
    // F030: the design's hold went from 1 s (60 steps) to half a second (30 steps).
    expect(DEFAULT_TUNING.uprightHoldSeconds).toBe(0.5);
    const j = flipped();
    expect(feed(j, 29, resting(0))).toBeNull();
    expect(j.observe(resting(0))).toMatchObject({ result: 'success', reason: 'upright' });
  });

  it('is not a success while the bottle keeps rocking or tipping past the still limits', () => {
    const upright = resting(0);
    const limits = { speed: DEFAULT_TUNING.stillSpeed, spin: DEFAULT_TUNING.stillSpin };
    // Just inside the limits it counts as still; at or past them it never does, however long.
    expect(feed(flipped(), 30, { ...upright, vx: limits.speed * 0.9 })?.reason).toBe('upright');
    expect(feed(flipped(), 30, { ...upright, omega: limits.spin * 0.9 })?.reason).toBe('upright');
    expect(feed(flipped(), 600, { ...upright, vx: limits.speed * 1.1 })?.reason).toBe('timeout');
    expect(feed(flipped(), 600, { ...upright, omega: limits.spin * 1.1 })?.reason).toBe('timeout');
    // A bottle rocking on its base (still, then moving, every 29 steps) never completes a hold.
    const rocking = flipped({ timeoutSeconds: 100 });
    let outcome = null;
    for (let cycle = 0; cycle < 20; cycle++) {
      outcome = feed(rocking, 29, upright);
      expect(outcome).toBeNull();
      outcome = rocking.observe({ ...upright, omega: 1 });
      expect(outcome).toBeNull();
    }
    // A bottle that is still tipping, 20° off upright, is not a success either: it is a side.
    expect(feed(flipped(), 600, resting(deg(20)))).toMatchObject({
      result: 'fail',
      reason: 'side',
    });
  });

  it('starts counting again whenever the bottle moves, leaves the table or tips past the limit', () => {
    const upright = resting(0);
    const moving = { ...upright, vx: 0.5 };
    const spinning = { ...upright, omega: 0.5 };
    const airborne = { ...upright, onTable: false };
    for (const interruption of [moving, spinning, airborne, resting(deg(20))]) {
      const j = flipped();
      feed(j, 29, upright);
      expect(j.observe(interruption)).toBeNull();
      expect(feed(j, 29, upright)).toBeNull(); // the count restarted, 29 is not enough
      expect(j.observe(upright)?.reason).toBe('upright');
    }
  });

  it('accepts a tilt up to the tolerance and rejects more, at any number of whole turns', () => {
    expect(feed(flipped(), 30, resting(deg(14.9)))?.reason).toBe('upright');
    expect(feed(flipped(), 30, resting(deg(-14.9)))?.reason).toBe('upright');
    expect(feed(flipped(), 30, resting(TWO_PI + deg(14.9)))?.reason).toBe('upright');
    expect(feed(flipped(), 30, resting(-3 * TWO_PI))?.reason).toBe('upright');
    // Just past the tolerance and lying still it is a fail, not a success, however long it waits.
    expect(feed(judge(), 60, resting(deg(15.1)))).toMatchObject({ result: 'fail', reason: 'side' });
    expect(feed(judge(), 60, resting(deg(-15.1)))).toMatchObject({ reason: 'side' });
    expect(feed(judge({ uprightToleranceDeg: 5 }), 60, resting(deg(10)))?.reason).toBe('side');
    expect(feed(flipped({ uprightToleranceDeg: 20 }), 30, resting(deg(18)))?.reason).toBe(
      'upright',
    );
  });

  it('uses the hold time from the tuning', () => {
    const j = flipped({ uprightHoldSeconds: 0.25 });
    expect(feed(j, 14, resting(0))).toBeNull();
    expect(j.observe(resting(0))?.reason).toBe('upright'); // 15 steps = 0.25 s
  });

  it('judges a bottle resting past the tolerance as a side, or as a cap beyond 135°', () => {
    expect(feed(judge(), 30, resting(Math.PI / 2))).toMatchObject({
      result: 'fail',
      reason: 'side',
    });
    expect(feed(judge(), 30, resting(-Math.PI / 2))).toMatchObject({ reason: 'side' });
    expect(feed(judge(), 30, resting(deg(20)))).toMatchObject({ reason: 'side' });
    expect(feed(judge(), 30, resting(deg(134)))).toMatchObject({ reason: 'side' });
    expect(feed(judge(), 30, resting(deg(136)))).toMatchObject({ reason: 'cap' });
    expect(feed(judge(), 30, resting(deg(-136)))).toMatchObject({ reason: 'cap' });
    // On the cap is a success (design section 2, 2026-11-22); on the side stays a fail.
    expect(feed(judge(), 30, resting(Math.PI))).toMatchObject({ result: 'success', reason: 'cap' });
    expect(feed(judge(), 30, resting(3 * Math.PI))).toMatchObject({ reason: 'cap' });
    expect(feed(judge({ capAngleDeg: 100 }), 30, resting(deg(120)))).toMatchObject({
      reason: 'cap',
    });
  });

  it('decides a fail after the fail-rest time, not before', () => {
    const j = judge();
    expect(feed(j, 29, resting(Math.PI / 2))).toBeNull(); // 0.5 s is 30 steps
    expect(j.observe(resting(Math.PI / 2))?.reason).toBe('side');
    const quick = judge({ failRestSeconds: 0.1 });
    expect(feed(quick, 5, resting(Math.PI / 2))).toBeNull();
    expect(quick.observe(resting(Math.PI / 2))?.reason).toBe('side');
  });

  it('does not call a bottle at rest unless it is nearly still and on the table', () => {
    const side = resting(Math.PI / 2);
    // A bottle at the top of its arc is slow for a moment but is not on the table.
    expect(feed(judge(), 200, { ...side, onTable: false })).toBeNull();
    // Still sliding or turning.
    expect(feed(judge(), 200, { ...side, vx: 0.2 })).toBeNull();
    expect(feed(judge(), 200, { ...side, omega: 0.5 })).toBeNull();
    // Just under the thresholds counts as still.
    const slow = { ...side, vx: DEFAULT_TUNING.stillSpeed * 0.9 };
    expect(feed(judge(), 30, slow)?.reason).toBe('side');
    const slowSpin = { ...side, omega: -DEFAULT_TUNING.stillSpin * 0.9 };
    expect(feed(judge(), 30, slowSpin)?.reason).toBe('side');
  });

  it('is off the table once the lowest point is well below the top, as an upright fall', () => {
    const base = resting(0);
    expect(judge().observe({ ...base, y: TABLE_TOP_Y + 0.05, onTable: false })).toBeNull();
    expect(judge().observe({ ...base, y: TABLE_TOP_Y + 0.2, onTable: false })).toMatchObject({
      result: 'fail',
      reason: 'offTable',
    });
    expect(
      judge({ offTableDepth: 1 }).observe({ ...base, y: TABLE_TOP_Y + 0.5, onTable: false }),
    ).toBeNull();
    // A bottle on its cap has its origin far above the table: that is not "below the table".
    expect(judge().observe(resting(Math.PI))).toBeNull();
  });

  it('is off the screen only when it is completely past the left, right or bottom edge', () => {
    const at = (x: number, y: number) => ({ ...resting(0), x, y, onTable: false });
    const high = TABLE_TOP_Y - 3;
    // Half out of the left or right edge is still on screen.
    expect(judge().observe(at(0, high))).toBeNull();
    expect(judge().observe(at(WORLD_WIDTH_M, high))).toBeNull();
    expect(judge().observe(at(-HALF_WIDTH - 0.01, high))).toMatchObject({
      result: 'fail',
      reason: 'offScreen',
    });
    expect(judge().observe(at(WORLD_WIDTH_M + HALF_WIDTH + 0.01, high))?.reason).toBe('offScreen');
    // The whole bottle below the bottom edge.
    expect(judge().observe(at(TABLE_CENTER_X, WORLD_HEIGHT_M + BOTTLE_HEIGHT + 1))?.reason).toBe(
      'offScreen',
    );
    // Above the top edge it comes back down: not a fail.
    expect(judge().observe(at(TABLE_CENTER_X, -50))).toBeNull();
  });

  it('times out at the configured number of seconds after release, and not before', () => {
    const flying = { ...resting(0), y: 1, onTable: false, vy: 3 };
    const j = judge();
    expect(feed(j, 299, flying)).toBeNull();
    expect(j.observe(flying)).toMatchObject({ result: 'fail', reason: 'timeout' }); // 5 s
    const short = judge({ timeoutSeconds: 0.5 });
    expect(feed(short, 29, flying)).toBeNull();
    expect(short.observe(flying)?.reason).toBe('timeout');
  });

  it('lets a success that completes on the timeout step win', () => {
    const j = flipped({ timeoutSeconds: 1, uprightHoldSeconds: 1 });
    expect(feed(j, 60, resting(0))?.reason).toBe('upright');
  });

  it('never changes an outcome once it is set', () => {
    const j = flipped();
    const first = feed(j, 60, resting(0));
    expect(first?.reason).toBe('upright');
    const snapshot = { ...first! };
    // Anything that happens afterwards is ignored: tipping over, falling off, leaving the screen.
    expect(j.observe(resting(Math.PI / 2))).toEqual(snapshot);
    expect(feed(j, 500, { ...resting(0), y: 30, onTable: false })).toEqual(snapshot);
    expect(j.outcome).toEqual(snapshot);
    expect(j.rotation).toBeCloseTo(snapshot.rotation, 12); // and it stopped adding up turns
  });

  it('adds up the turning since release, over any number of turns and either way', () => {
    const j = judge({ timeoutSeconds: 100 }, 1); // released at 1 rad
    let angle = 1;
    for (let i = 0; i < 400; i++) {
      angle += 0.1; // 0.1 rad per step, 40 rad in total: about 6.4 turns
      j.observe({ ...resting(0), y: 1, onTable: false, angle });
    }
    expect(j.rotation).toBeCloseTo(40, 6);
    const back = judge({}, 0);
    for (let i = 1; i <= 100; i++)
      back.observe({ ...resting(0), y: 1, onTable: false, angle: -0.2 * i });
    expect(back.rotation).toBeCloseTo(-20, 6);
  });

  it('reports rotation and turns in the outcome, with turns rounded and never -0', () => {
    const j = judge({}, 0);
    j.observe({ ...resting(Math.PI * 0.99), onTable: false, y: 1 });
    const out = feed(j, 60, resting(Math.PI * 0.99));
    expect(out).toMatchObject({ reason: 'cap' });
    expect(out?.rotation).toBeCloseTo(Math.PI * 0.99, 9);
    expect(out?.turns).toBe(0); // 0.495 turns rounds to 0
    const almostOne = judge();
    almostOne.observe({ ...resting(3), onTable: false, y: 1 });
    almostOne.observe({ ...resting(6), onTable: false, y: 1 });
    const full = feed(almostOne, 30, resting(6)); // lies still at 6 rad, 16° short of a full turn
    expect(full).toMatchObject({ reason: 'side', turns: 1 }); // 0.95 turns rounds to 1
    const upright = judge();
    const done = feed(upright, 60, resting(0));
    expect(done?.rotation).toBe(0);
    expect(Object.is(done?.turns, 0)).toBe(true);
    const counter = judge();
    const reversed = feed(counter, 30, resting(-0.3));
    expect(Object.is(reversed?.turns, 0)).toBe(true);
  });
});
