import { describe, expect, it } from 'vitest';
import { BOTTLE_BODY_WIDTH, BOTTLE_HEIGHT } from '../../src/core/bottleShape';
import { WORLD_HEIGHT_M, WORLD_WIDTH_M } from '../../src/core/constants';
import { Simulation } from '../../src/core/simulation';
import { TABLE_CENTER_X, TABLE_RIGHT_X, TABLE_LEFT_X, TABLE_TOP_Y } from '../../src/core/table';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { FLIPPED } from '../shared';
import { placed, run, runToOutcome } from './helpers';

const TWO_PI = Math.PI * 2;
const deg = (degrees: number): number => (degrees * Math.PI) / 180;
const HALF_WIDTH = BOTTLE_BODY_WIDTH / 2;

describe('judging a landing in the simulation', () => {
  it('judges an upright bottle placed just above the table a success once it stood still for 0.5 s', () => {
    const sim = placed(FLIPPED); // credited one turn: without one it would be a "no flip"
    // Not while it is falling or settling, and not before half a second (30 steps) of standing still.
    expect(run(sim, 20).outcome).toBeNull();
    expect(run(sim, 14).outcome).toBeNull(); // 34 steps in
    const steps = 34 + runToOutcome(sim);
    expect(steps).toBeGreaterThan(30); // the fall and landing come before the 30-step hold
    expect(steps).toBeLessThan(90); // the e2e test relies on 90 frames being enough
    const { outcome, bottle } = sim.snapshot();
    expect(outcome).toMatchObject({ result: 'success', reason: 'upright', turns: 1, points: 1 });
    expect(Math.abs(outcome!.rotation - TWO_PI)).toBeLessThan(0.01); // the credit, nothing more
    expect(Math.hypot(bottle.vx, bottle.vy)).toBeLessThan(DEFAULT_TUNING.stillSpeed);
    expect(bottle.y).toBeLessThan(TABLE_TOP_Y);
    expect(bottle.y).toBeGreaterThan(TABLE_TOP_Y - 0.1);
  });

  it('holds the success back for the whole half second even when the bottle starts at rest on the table', () => {
    const sim = placed({ ...FLIPPED, y: TABLE_TOP_Y - 0.012 });
    expect(run(sim, 28).outcome).toBeNull();
    expect(runToOutcome(sim)).toBeLessThan(15);
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

  // Design section 2 (2026-11-26): a cap landing after a full turn scores a flat `capPoints` (5);
  // a half-turn tip-over (no full turn) scores `capTipPoints` (1), the farming fallback of F051.
  it('judges a bottle on its cap with no full turn a success and a landing worth capTipPoints', () => {
    const sim = placed({
      x: TABLE_CENTER_X,
      y: TABLE_TOP_Y - BOTTLE_HEIGHT - 0.02,
      angle: Math.PI,
    });
    runToOutcome(sim);
    expect(sim.snapshot().outcome).toMatchObject({
      result: 'success',
      reason: 'cap',
      turns: 0,
      points: DEFAULT_TUNING.capTipPoints,
    });
    expect(DEFAULT_TUNING.capTipPoints).toBe(1);
    expect(sim.snapshot()).toMatchObject({ score: 1, landings: 1 });
  });

  it('scores a cap after a full turn capPoints (5), follows setTuning, and leaves upright alone', () => {
    const pose = {
      x: TABLE_CENTER_X,
      y: TABLE_TOP_Y - BOTTLE_HEIGHT - 0.02,
      angle: Math.PI,
      turns: 1,
    };
    const sim = placed(pose);
    runToOutcome(sim);
    expect(sim.snapshot().outcome).toMatchObject({ result: 'success', reason: 'cap', points: 5 });
    expect(sim.snapshot()).toMatchObject({ score: 5, landings: 1 });
    // The tuning is frozen at the throw, so the next cap after the change scores 7.
    const seven = placed(pose, { tuning: { capPoints: 7 } });
    runToOutcome(seven);
    expect(seven.snapshot().outcome).toMatchObject({ reason: 'cap', points: 7 });
    expect(seven.snapshot().score).toBe(7);
    const double = placed({ ...pose, angle: 0, y: TABLE_TOP_Y - 0.05, turns: 2 });
    runToOutcome(double);
    expect(double.snapshot().outcome).toMatchObject({ reason: 'upright', points: 2 });
  });

  it('counts a tip-over as 5 when capTipPoints is 5', () => {
    const sim = placed(
      { x: TABLE_CENTER_X, y: TABLE_TOP_Y - BOTTLE_HEIGHT - 0.02, angle: Math.PI },
      { tuning: { capTipPoints: 5 } },
    );
    runToOutcome(sim);
    expect(sim.snapshot().outcome).toMatchObject({ reason: 'cap', turns: 0, points: 5 });
  });

  it('judges a bottle that fell onto its cap and toppled by the time it rests: side, not cap', () => {
    // Past the balance point, so it tips over from the cap onto its side. The default bottle is
    // wide and squat (F009), so it balances on its cap up to about 0.2 rad of tilt: 0.45 is
    // clearly past it.
    const sim = placed({
      x: TABLE_CENTER_X,
      y: TABLE_TOP_Y - BOTTLE_HEIGHT - 0.02,
      angle: Math.PI + 0.45,
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
      // The judge counts turns made since release, so the angle itself adds none; the credit does.
      const sim = placed({ ...FLIPPED, angle });
      runToOutcome(sim);
      const { outcome } = sim.snapshot();
      expect(outcome).toMatchObject({ result: 'success', reason: 'upright', turns: 1 });
      expect(Math.abs(outcome!.rotation - TWO_PI)).toBeLessThan(0.01);
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
    // Released at 1 rad and spinning clockwise at 2 turns per second from 6 m above the table. The
    // spin is not damped here: this test is about counting turns, and the default bottle slows its
    // spin down (F009), which would make the count depend on the damping.
    const sim = placed(
      { x: TABLE_CENTER_X, y: TABLE_TOP_Y - 6, angle: 1, omega: 4 * Math.PI },
      { tuning: { bottleAngularDamping: 0 } },
    );
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
    const sim = placed(
      { x: TABLE_CENTER_X, y: TABLE_TOP_Y - 6, angle: 0, omega: -4 * Math.PI },
      { tuning: { bottleAngularDamping: 0 } }, // undamped, as in the test above
    );
    runToOutcome(sim);
    const { outcome } = sim.snapshot();
    expect(outcome!.rotation).toBeLessThan(-TWO_PI);
    expect(outcome!.turns).toBeLessThanOrEqual(-1);
  });

  it('lets a 50%-water bottle placed still on a corner of its base, tilted 10°, tip back and succeed', () => {
    const tilt = deg(10);
    const sim = placed(
      // Resting on its right corner: the base's low corner sits on the tabletop. One turn is
      // credited (a landing needs one); the tipping back is then physics only.
      {
        x: TABLE_CENTER_X,
        y: TABLE_TOP_Y - HALF_WIDTH * Math.sin(tilt) - 0.01,
        angle: tilt,
        turns: 1,
      },
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
    // It turned counterclockwise, back toward upright, so a little less than the credited turn.
    expect(outcome!.rotation).toBeLessThan(TWO_PI);
    expect(outcome!.rotation).toBeGreaterThan(TWO_PI - tilt - 0.05);
    expect(outcome!.turns).toBe(1);
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
    // A long result delay keeps this bottle on the table (the result phase) for the whole test.
    const stay = { resultDelaySeconds: 100 };
    const sim = placed(FLIPPED, { tuning: stay });
    runToOutcome(sim);
    const first = sim.snapshot().outcome;
    expect(first?.reason).toBe('upright');
    run(sim, 600); // far past the timeout; the bottle just keeps standing
    expect(sim.snapshot().outcome).toEqual(first);

    const timed = placed(
      { x: TABLE_CENTER_X, y: 0, angle: 0 },
      { tuning: { timeoutSeconds: 0.5, ...stay } },
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
