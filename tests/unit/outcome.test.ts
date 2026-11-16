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
import { Simulation, type SimSnapshot } from '../../src/core/simulation';
import { TABLE_CENTER_X, TABLE_RIGHT_X, TABLE_LEFT_X, TABLE_TOP_Y } from '../../src/core/table';
import { DEFAULT_TUNING, resolveTuning, type Tuning } from '../../src/core/tuning';

const TWO_PI = Math.PI * 2;
const deg = (degrees: number): number => (degrees * Math.PI) / 180;
const HALF_WIDTH = BOTTLE_BODY_WIDTH / 2;

/** Step a simulation until its outcome is set (at most `limit` steps); returns the steps taken. */
function runToOutcome(sim: Simulation, limit = 600): number {
  let steps = 0;
  while (sim.snapshot().outcome === null && steps < limit) {
    sim.step();
    steps++;
  }
  return steps;
}

function run(sim: Simulation, steps: number): SimSnapshot {
  for (let i = 0; i < steps; i++) sim.step();
  return sim.snapshot();
}

/** A simulation with `pose` placed (and an optional water level and tuning), not yet stepped. */
function placed(
  pose: Parameters<Simulation['placeBottle']>[0],
  options: { water?: number; tuning?: Partial<Tuning> } = {},
): Simulation {
  const sim = new Simulation({ seed: 1, tuning: options.tuning });
  if (options.water !== undefined) sim.setWater(options.water);
  expect(sim.placeBottle(pose)).toBe(true);
  return sim;
}

/** Just above the table, upright, at the middle. */
const UPRIGHT = { x: TABLE_CENTER_X, y: TABLE_TOP_Y - 0.05, angle: 0 };

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

  const judge = (tuning: Partial<Tuning> = {}, releaseAngle = 0) =>
    new LandingJudge(resolveTuning(tuning), releaseAngle);

  it('needs the full hold time standing upright, on the table and nearly still', () => {
    const j = judge();
    expect(feed(j, 59, resting(0))).toBeNull();
    expect(j.observe(resting(0))).toMatchObject({ result: 'success', reason: 'upright' });
  });

  it('starts counting again whenever the bottle moves, leaves the table or tips past the limit', () => {
    const upright = resting(0);
    const moving = { ...upright, vx: 0.5 };
    const spinning = { ...upright, omega: 0.5 };
    const airborne = { ...upright, onTable: false };
    for (const interruption of [moving, spinning, airborne, resting(deg(20))]) {
      const j = judge();
      feed(j, 59, upright);
      expect(j.observe(interruption)).toBeNull();
      expect(feed(j, 59, upright)).toBeNull(); // the count restarted, 59 is not enough
      expect(j.observe(upright)?.reason).toBe('upright');
    }
  });

  it('accepts a tilt up to the tolerance and rejects more, at any number of whole turns', () => {
    expect(feed(judge(), 60, resting(deg(14.9)))?.reason).toBe('upright');
    expect(feed(judge(), 60, resting(deg(-14.9)))?.reason).toBe('upright');
    expect(feed(judge(), 60, resting(TWO_PI + deg(14.9)))?.reason).toBe('upright');
    expect(feed(judge(), 60, resting(-3 * TWO_PI))?.reason).toBe('upright');
    // Just past the tolerance and lying still it is a fail, not a success, however long it waits.
    expect(feed(judge(), 60, resting(deg(15.1)))).toMatchObject({ result: 'fail', reason: 'side' });
    expect(feed(judge(), 60, resting(deg(-15.1)))).toMatchObject({ reason: 'side' });
    expect(feed(judge({ uprightToleranceDeg: 5 }), 60, resting(deg(10)))?.reason).toBe('side');
    expect(feed(judge({ uprightToleranceDeg: 20 }), 60, resting(deg(18)))?.reason).toBe('upright');
  });

  it('uses the hold time from the tuning', () => {
    const j = judge({ uprightHoldSeconds: 0.25 });
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
    expect(feed(judge(), 30, resting(Math.PI))).toMatchObject({ result: 'fail', reason: 'cap' });
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
    const j = judge({ timeoutSeconds: 1, uprightHoldSeconds: 1 });
    expect(feed(j, 60, resting(0))?.reason).toBe('upright');
  });

  it('never changes an outcome once it is set', () => {
    const j = judge();
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

describe('Simulation.placeBottle', () => {
  it('releases the bottle at exactly the given pose and velocity, as a flight', () => {
    const sim = new Simulation({ seed: 1 });
    const ok = sim.placeBottle({ x: 6, y: 2, angle: 0.7, vx: 1, vy: -2, omega: 3 });
    expect(ok).toBe(true);
    const s = sim.snapshot();
    expect(s.phase).toBe('flying');
    expect(s.outcome).toBeNull();
    expect(s.bottle).toMatchObject({
      x: 6,
      y: 2,
      angle: 0.7,
      vx: 1,
      vy: -2,
      omega: 3,
      awake: true,
    });
    // The bottle is dynamic now: gravity pulls it down.
    const later = run(sim, 10).bottle;
    expect(later.vy).toBeGreaterThan(-2 + 10 * (1 / 60) * 9);
    expect(later.y).toBeGreaterThan(1.5);
  });

  it('defaults the velocities to zero and leaves lastThrow alone', () => {
    const sim = new Simulation({ seed: 1 });
    sim.placeBottle({ x: 6, y: 2, angle: 0 });
    const s = sim.snapshot();
    expect(s.bottle).toMatchObject({ vx: 0, vy: 0, omega: 0 });
    expect(s.lastThrow).toBeNull();
  });

  it('works once: not during a flight, not after a throw, and not with bad numbers', () => {
    const sim = new Simulation({ seed: 1 });
    expect(sim.placeBottle({ x: NaN, y: 2, angle: 0 })).toBe(false);
    expect(sim.placeBottle({ x: 6, y: Infinity, angle: 0 })).toBe(false);
    expect(sim.placeBottle({ x: 6, y: 2, angle: 0, omega: NaN })).toBe(false);
    expect(sim.snapshot().phase).toBe('aiming');
    expect(sim.placeBottle({ x: 6, y: 2, angle: 0 })).toBe(true);
    const before = run(sim, 5);
    expect(sim.placeBottle({ x: 9, y: 1, angle: 1 })).toBe(false);
    expect(sim.throwBottle(50)).toBe(false);
    expect(sim.snapshot()).toEqual(before);

    const thrown = new Simulation({ seed: 1 });
    thrown.throwBottle(50);
    expect(thrown.placeBottle({ x: 6, y: 2, angle: 0 })).toBe(false);
  });

  it('keeps the water level the bottle had in the hand', () => {
    const sim = new Simulation({ seed: 1 });
    sim.setWater(0.65);
    sim.placeBottle(UPRIGHT);
    expect(sim.snapshot().bottle.water).toBe(0.65);
  });

  it('is deterministic', () => {
    const a = run(placed({ ...UPRIGHT, angle: 0.1, omega: 2, vx: 1 }), 400);
    const b = run(placed({ ...UPRIGHT, angle: 0.1, omega: 2, vx: 1 }), 400);
    expect(a).toEqual(b);
  });
});

describe('judging a landing in the simulation', () => {
  it('judges an upright bottle placed just above the table a success once it stood still for 1 s', () => {
    const sim = placed(UPRIGHT);
    // Not while it is falling or settling, and not before a full second of standing still.
    expect(run(sim, 30).outcome).toBeNull();
    expect(run(sim, 29).outcome).toBeNull(); // 59 steps in
    const steps = 59 + runToOutcome(sim);
    expect(steps).toBeGreaterThan(60);
    expect(steps).toBeLessThan(150); // the e2e test relies on 150 frames being enough
    const { outcome, bottle } = sim.snapshot();
    expect(outcome).toMatchObject({ result: 'success', reason: 'upright', turns: 0 });
    expect(Math.abs(outcome!.rotation)).toBeLessThan(0.01);
    expect(Math.hypot(bottle.vx, bottle.vy)).toBeLessThan(DEFAULT_TUNING.stillSpeed);
    expect(bottle.y).toBeLessThan(TABLE_TOP_Y);
    expect(bottle.y).toBeGreaterThan(TABLE_TOP_Y - 0.1);
  });

  it('holds the success back for the whole second even when the bottle starts at rest on the table', () => {
    const sim = placed({ ...UPRIGHT, y: TABLE_TOP_Y - 0.012 });
    expect(run(sim, 58).outcome).toBeNull();
    expect(runToOutcome(sim)).toBeLessThan(30);
    expect(sim.snapshot().outcome?.reason).toBe('upright');
  });

  it('judges a bottle lying on its side a fail, reason side', () => {
    for (const angle of [Math.PI / 2, -Math.PI / 2]) {
      const sim = placed({ x: TABLE_CENTER_X, y: TABLE_TOP_Y - HALF_WIDTH - 0.05, angle });
      runToOutcome(sim);
      const { outcome, bottle } = sim.snapshot();
      expect(outcome).toMatchObject({ result: 'fail', reason: 'side', turns: 0 });
      expect(Math.abs(Math.abs(bottle.angle) - Math.PI / 2)).toBeLessThan(0.2);
    }
  });

  it('judges a bottle upside down on its cap a fail, reason cap', () => {
    const sim = placed({
      x: TABLE_CENTER_X,
      y: TABLE_TOP_Y - BOTTLE_HEIGHT - 0.02,
      angle: Math.PI,
    });
    runToOutcome(sim);
    expect(sim.snapshot().outcome).toMatchObject({ result: 'fail', reason: 'cap' });
  });

  it('judges a bottle that fell onto its cap and toppled by the time it rests: side, not cap', () => {
    // Slightly past the balance point, so it tips over from the cap onto its side.
    const sim = placed({
      x: TABLE_CENTER_X,
      y: TABLE_TOP_Y - BOTTLE_HEIGHT - 0.02,
      angle: Math.PI + 0.15,
    });
    runToOutcome(sim);
    expect(sim.snapshot().outcome).toMatchObject({ result: 'fail', reason: 'side' });
  });

  it('judges a bottle beyond either end of the table a fail, reason offTable', () => {
    for (const x of [TABLE_RIGHT_X + 0.6, TABLE_LEFT_X - 0.6]) {
      const sim = placed({ x, y: TABLE_TOP_Y - 0.5, angle: 0 });
      runToOutcome(sim);
      const { outcome, bottle } = sim.snapshot();
      expect(outcome).toMatchObject({ result: 'fail', reason: 'offTable' });
      expect(bottle.y).toBeGreaterThan(TABLE_TOP_Y); // it was caught on the way down
    }
  });

  it('judges a bottle that tips over the end of the table offTable', () => {
    // Half of its base on the table: it pivots over the edge and falls.
    const sim = placed({ x: TABLE_RIGHT_X + 0.1, y: TABLE_TOP_Y - 0.02, angle: 0 });
    runToOutcome(sim);
    expect(sim.snapshot().outcome?.reason).toBe('offTable');
  });

  it('judges a bottle moving fast toward a side edge, above the table, offScreen', () => {
    const right = placed({ x: 8, y: 2, angle: 0, vx: 40 });
    runToOutcome(right);
    expect(right.snapshot().outcome).toMatchObject({ result: 'fail', reason: 'offScreen' });
    expect(right.snapshot().bottle.x).toBeGreaterThan(WORLD_WIDTH_M);
    const left = placed({ x: 5, y: 2, angle: 0, vx: -40 });
    runToOutcome(left);
    expect(left.snapshot().outcome).toMatchObject({ result: 'fail', reason: 'offScreen' });
    expect(left.snapshot().bottle.x).toBeLessThan(0);
  });

  it('is offScreen at the bottom only for a bottle that never fell past the table first', () => {
    // Placed far below the screen, so the bottom edge is the first thing that is true.
    const sim = placed({ x: TABLE_CENTER_X, y: WORLD_HEIGHT_M + 5, angle: 0 });
    run(sim, 1);
    expect(sim.snapshot().outcome?.reason).toBe('offScreen');
  });

  it('lets a bottle fly above the top of the screen and come back', () => {
    const sim = placed({ x: 5, y: 4, angle: 0, vy: -20 }); // peaks about 20 m up
    run(sim, 60);
    expect(sim.snapshot().bottle.y).toBeLessThan(0);
    expect(sim.snapshot().outcome).toBeNull();
    runToOutcome(sim);
    expect(sim.snapshot().outcome).not.toBeNull();
  });

  it('counts a bottle placed upright with angle 2π as upright', () => {
    for (const angle of [TWO_PI, -TWO_PI, 3 * TWO_PI]) {
      const sim = placed({ ...UPRIGHT, angle });
      runToOutcome(sim);
      const { outcome } = sim.snapshot();
      expect(outcome).toMatchObject({ result: 'success', reason: 'upright', turns: 0 });
      expect(Math.abs(outcome!.rotation)).toBeLessThan(0.01);
    }
    // A quarter turn on top of whole turns is still a side.
    const sim = placed({
      x: TABLE_CENTER_X,
      y: TABLE_TOP_Y - HALF_WIDTH - 0.05,
      angle: TWO_PI + Math.PI / 2,
    });
    runToOutcome(sim);
    expect(sim.snapshot().outcome).toMatchObject({ reason: 'side', turns: 0 });
  });

  it('measures rotation as the turning since release, in whole turns and radians', () => {
    // Released at 1 rad and spinning clockwise at 2 turns per second from 6 m above the table.
    const sim = placed({ x: TABLE_CENTER_X, y: TABLE_TOP_Y - 6, angle: 1, omega: 4 * Math.PI });
    runToOutcome(sim);
    const { outcome, bottle } = sim.snapshot();
    expect(outcome).not.toBeNull();
    // Whatever the bottle ended up doing, rotation is the unwrapped angle minus the release angle.
    expect(outcome!.rotation).toBeCloseTo(bottle.angle - 1, 6);
    expect(outcome!.rotation).toBeGreaterThan(TWO_PI); // it turned over more than once
    expect(outcome!.turns).toBe(Math.round(outcome!.rotation / TWO_PI));
    expect(outcome!.turns).toBeGreaterThanOrEqual(1);
  });

  it('counts a counterclockwise spin as negative turning', () => {
    const sim = placed({ x: TABLE_CENTER_X, y: TABLE_TOP_Y - 6, angle: 0, omega: -4 * Math.PI });
    runToOutcome(sim);
    const { outcome } = sim.snapshot();
    expect(outcome!.rotation).toBeLessThan(-TWO_PI);
    expect(outcome!.turns).toBeLessThanOrEqual(-1);
  });

  it('lets a 50%-water bottle placed still on a corner of its base, tilted 10°, tip back and succeed', () => {
    const tilt = deg(10);
    const sim = placed(
      // Resting on its right corner: the base's low corner sits on the tabletop.
      { x: TABLE_CENTER_X, y: TABLE_TOP_Y - HALF_WIDTH * Math.sin(tilt) - 0.01, angle: tilt },
      { water: 0.5 },
    );
    let fastest = 0;
    let tippedBack = false;
    while (sim.snapshot().outcome === null && sim.tick < 600) {
      sim.step();
      const { bottle } = sim.snapshot();
      fastest = Math.max(fastest, Math.abs(bottle.omega));
      if (Math.abs(bottle.angle) < deg(1)) tippedBack = true;
    }
    const { outcome, bottle } = sim.snapshot();
    expect(outcome).toMatchObject({ result: 'success', reason: 'upright' });
    expect(fastest).toBeGreaterThan(0.2); // it really did rock back by itself
    expect(tippedBack).toBe(true);
    expect(Math.abs(bottle.angle)).toBeLessThan(deg(3));
    expect(outcome!.rotation).toBeLessThan(0); // it turned counterclockwise, back toward upright
    expect(outcome!.turns).toBe(0);
  });

  it('judges a 10° tilt as a success only because the physics tipped it back (left tilted it falls)', () => {
    // The same bottle, with a tilt that is past its balance point, does not succeed.
    const tilt = deg(60);
    const sim = placed(
      { x: TABLE_CENTER_X, y: TABLE_TOP_Y - HALF_WIDTH * Math.sin(tilt) - 0.01, angle: tilt },
      { water: 0.5 },
    );
    runToOutcome(sim);
    expect(sim.snapshot().outcome?.result).toBe('fail');
  });

  it('times out at 0.5 s when that is the configured timeout, for a throw still in the air', () => {
    const sim = placed({ x: TABLE_CENTER_X, y: 0, angle: 0 }, { tuning: { timeoutSeconds: 0.5 } });
    expect(run(sim, 29).outcome).toBeNull();
    const after = run(sim, 1);
    expect(after.bottle.y).toBeLessThan(TABLE_TOP_Y - 1); // still in the air
    expect(after.outcome).toMatchObject({ result: 'fail', reason: 'timeout', turns: 0 });
  });

  it('times out after 5 s by default', () => {
    const sim = placed({ x: TABLE_CENTER_X, y: -300, angle: 0 });
    expect(run(sim, 299).outcome).toBeNull();
    expect(run(sim, 1).outcome).toMatchObject({ result: 'fail', reason: 'timeout' });
  });

  it('never changes an outcome once it is set', () => {
    const sim = placed(UPRIGHT);
    runToOutcome(sim);
    const first = sim.snapshot().outcome;
    expect(first?.reason).toBe('upright');
    run(sim, 600); // far past the timeout; the bottle just keeps standing
    expect(sim.snapshot().outcome).toEqual(first);

    const timed = placed(
      { x: TABLE_CENTER_X, y: 0, angle: 0 },
      { tuning: { timeoutSeconds: 0.5 } },
    );
    const timeout = run(timed, 30).outcome;
    expect(timeout?.reason).toBe('timeout');
    // The bottle then falls, lands and rests, but the outcome stays the timeout.
    expect(run(timed, 600).outcome).toEqual(timeout);
  });

  it('gives a thrown bottle an outcome too, and no outcome while it is held', () => {
    const sim = new Simulation({ seed: 3 });
    expect(run(sim, 120).outcome).toBeNull(); // waiting in the hand
    sim.throwBottle(50);
    expect(sim.snapshot().outcome).toBeNull();
    const steps = runToOutcome(sim, 1000);
    expect(steps).toBeLessThanOrEqual(300); // the timeout bounds every throw
    expect(sim.snapshot().outcome).not.toBeNull();
  });

  it('does not touch the bottle: a judged simulation moves exactly like the plain physics', () => {
    // Two copies, one that has its outcome read every step and one that is only read at the end.
    const a = placed({ x: 6, y: 2, angle: 0.3, vx: 2, vy: -4, omega: 5 });
    const b = placed({ x: 6, y: 2, angle: 0.3, vx: 2, vy: -4, omega: 5 });
    for (let i = 0; i < 400; i++) {
      a.step();
      a.snapshot();
      b.step();
    }
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('freezes the thresholds at release: retuning mid-flight does not change the judging', () => {
    const sim = placed({ x: TABLE_CENTER_X, y: 0, angle: 0 });
    sim.setTuning({ timeoutSeconds: 0.1 });
    expect(run(sim, 30).outcome).toBeNull(); // this flight still has the 5 s it was released with
  });
});
