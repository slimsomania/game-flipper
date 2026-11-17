import { describe, expect, it } from 'vitest';
import { HAND_Y } from '../../src/core/bottle';
import { bottleMassProperties } from '../../src/core/bottleShape';
import { Simulation, type SimSnapshot } from '../../src/core/simulation';
import { MAX_POWER, clampPower, throwImpulse } from '../../src/core/throw';
import { DEFAULT_TUNING, type Tuning } from '../../src/core/tuning';
import { run } from './helpers';

/** The default water range, 10% to 90% in 5% steps. */
const LEVELS = Array.from({ length: 17 }, (_, i) => Math.round((0.1 + i * 0.05) * 100) / 100);
const POWERS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** A simulation with the bottle at `water`, thrown with `power`, not yet stepped. */
function thrown(water: number, power: number, tuning: Partial<Tuning> = {}): Simulation {
  const sim = new Simulation({ seed: 1, tuning });
  sim.setWater(water);
  sim.throwBottle(power);
  return sim;
}

/** Launch speed and spin right after the throw. */
function launch(water: number, power: number, tuning: Partial<Tuning> = {}) {
  const { bottle } = thrown(water, power, tuning).snapshot();
  return {
    vx: bottle.vx,
    vy: bottle.vy,
    speed: Math.hypot(bottle.vx, bottle.vy),
    omega: bottle.omega,
  };
}

describe('throwImpulse', () => {
  it('points up and a few degrees toward the table, with a clockwise spin', () => {
    const { linear, angular } = throwImpulse(50, DEFAULT_TUNING);
    expect(linear.y).toBeLessThan(0);
    expect(linear.x).toBeGreaterThan(0);
    const degrees = (Math.atan2(linear.x, -linear.y) * 180) / Math.PI;
    expect(degrees).toBeCloseTo(DEFAULT_TUNING.throwAngleDeg, 9);
    expect(degrees).toBeGreaterThan(0);
    expect(degrees).toBeLessThan(15);
    expect(angular).toBeGreaterThan(0);
  });

  it('keeps the same direction at every power and scales both impulses with it', () => {
    const half = throwImpulse(50, DEFAULT_TUNING);
    const full = throwImpulse(100, DEFAULT_TUNING);
    expect(full.linear.x).toBeCloseTo(2 * half.linear.x, 9);
    expect(full.linear.y).toBeCloseTo(2 * half.linear.y, 9);
    expect(full.angular).toBeCloseTo(2 * half.angular, 9);
    expect(Math.hypot(full.linear.x, full.linear.y)).toBeCloseTo(
      DEFAULT_TUNING.throwLinearImpulse,
      9,
    );
    expect(full.angular).toBeCloseTo(DEFAULT_TUNING.throwAngularImpulse, 9);
  });

  it('is zero at power 0 and takes its numbers from the tuning', () => {
    const none = throwImpulse(0, DEFAULT_TUNING);
    expect([Math.abs(none.linear.x), Math.abs(none.linear.y), none.angular]).toEqual([0, 0, 0]);
    const strong = throwImpulse(100, {
      ...DEFAULT_TUNING,
      throwAngleDeg: 0,
      throwLinearImpulse: 20,
    });
    expect(strong.linear.x).toBeCloseTo(0, 12);
    expect(strong.linear.y).toBeCloseTo(-20, 12);
  });

  it('clamps power to 0..100', () => {
    expect(clampPower(-5)).toBe(0);
    expect(clampPower(0)).toBe(0);
    expect(clampPower(42.5)).toBe(42.5);
    expect(clampPower(100)).toBe(100);
    expect(clampPower(1e9)).toBe(100);
    expect(clampPower(Infinity)).toBe(100);
    expect(throwImpulse(500, DEFAULT_TUNING)).toEqual(throwImpulse(MAX_POWER, DEFAULT_TUNING));
    expect(throwImpulse(-500, DEFAULT_TUNING)).toEqual(throwImpulse(0, DEFAULT_TUNING));
  });
});

describe('Simulation.throwBottle', () => {
  it('waits in the aiming phase with no throw recorded', () => {
    const snap = new Simulation({ seed: 3 }).snapshot();
    expect(snap.phase).toBe('aiming');
    expect(snap.lastThrow).toBeNull();
  });

  it('launches the bottle up, toward the table, spinning clockwise', () => {
    for (const water of [0.1, 0.5, 0.9]) {
      for (const power of [10, 50, 100]) {
        const { vx, vy, omega } = launch(water, power);
        expect(vy).toBeLessThan(0); // up
        expect(vx).toBeGreaterThan(0); // toward the table
        expect(vx).toBeLessThan(0.25 * Math.abs(vy)); // a small drift, mostly straight up
        expect(omega).toBeGreaterThan(0); // clockwise
      }
    }
  });

  it('puts the bottle in the flying phase and records the throw', () => {
    const sim = new Simulation({ seed: 1 });
    sim.setWater(0.35);
    expect(sim.throwBottle(50)).toBe(true);
    const snap = sim.snapshot();
    expect(snap.phase).toBe('flying');
    expect(snap.lastThrow).toEqual({ power: 50, water: 0.35, source: 'keyboard' });
    expect(sim.phase).toBe('flying');
  });

  it('records the source of the throw', () => {
    const sim = new Simulation({ seed: 1 });
    sim.throwBottle(60, 'mouse');
    expect(sim.snapshot().lastThrow?.source).toBe('mouse');
  });

  it('gives a mouse throw and a keyboard throw the same physics', () => {
    const a = new Simulation({ seed: 2 });
    const b = new Simulation({ seed: 2 });
    a.throwBottle(64, 'keyboard');
    b.throwBottle(64, 'mouse');
    run(a, 200);
    run(b, 200);
    expect(a.snapshot().bottle).toEqual(b.snapshot().bottle);
  });

  it('gives a launch speed equal to the impulse divided by the bottle’s mass', () => {
    for (const water of [0.1, 0.5, 0.9]) {
      const { mass } = bottleMassProperties(water, DEFAULT_TUNING);
      const { speed } = launch(water, 100);
      expect(speed).toBeCloseTo(DEFAULT_TUNING.throwLinearImpulse / mass, 6);
    }
  });

  it('rises above the start, then comes down onto the table', () => {
    const sim = thrown(0.5, 50);
    const start = sim.snapshot().bottle.y;
    let apex = start;
    // Until the landing is judged: after the result delay the next bottle takes its place.
    for (let i = 0; i < 300 && sim.snapshot().outcome === null; i++) {
      sim.step();
      apex = Math.min(apex, sim.snapshot().bottle.y);
    }
    const { bottle, outcome } = sim.snapshot();
    expect(outcome).not.toBeNull();
    expect(apex).toBeLessThan(start - 1);
    expect(bottle.y).toBeGreaterThan(start); // lower than the hand: it is on the table
  });

  describe('power and water', () => {
    it('gives strictly more launch speed and spin for more power, at every water level', () => {
      for (const water of LEVELS) {
        let previous = launch(water, 0);
        for (const power of POWERS) {
          const now = launch(water, power);
          expect(now.speed, `water ${water} power ${power}`).toBeGreaterThan(previous.speed);
          expect(now.omega, `water ${water} power ${power}`).toBeGreaterThan(previous.omega);
          previous = now;
        }
      }
    });

    it('gives strictly less launch speed and spin for more water, at every power', () => {
      for (const power of POWERS) {
        let previous = launch(LEVELS[0]!, power);
        for (const water of LEVELS.slice(1)) {
          const now = launch(water, power);
          expect(now.speed, `power ${power} water ${water}`).toBeLessThan(previous.speed);
          expect(now.omega, `power ${power} water ${water}`).toBeLessThan(previous.omega);
          previous = now;
        }
      }
    });
  });

  describe('power limits', () => {
    it('clamps power to 0..100', () => {
      expect(launch(0.5, 250)).toEqual(launch(0.5, 100));
      expect(launch(0.5, Infinity)).toEqual(launch(0.5, 100));
      expect(launch(0.5, -30)).toEqual(launch(0.5, 0));
      expect(thrown(0.5, 250).snapshot().lastThrow?.power).toBe(100);
      expect(thrown(0.5, -30).snapshot().lastThrow?.power).toBe(0);
    });

    it('at power 0 just lets go: the bottle drops with no launch', () => {
      const { vx, vy, omega } = launch(0.5, 0);
      expect([vx, vy, omega]).toEqual([0, 0, 0]);
      expect(thrown(0.5, 0).snapshot().phase).toBe('flying');
    });

    it('ignores a power that is not a number', () => {
      const sim = new Simulation({ seed: 1 });
      expect(sim.throwBottle(NaN)).toBe(false);
      expect(sim.snapshot().phase).toBe('aiming');
      expect(sim.snapshot().lastThrow).toBeNull();
    });
  });

  describe('only while aiming', () => {
    it('does nothing once the bottle is in flight', () => {
      const sim = new Simulation({ seed: 1 });
      sim.setWater(0.5);
      expect(sim.throwBottle(30)).toBe(true);
      run(sim, 15);
      const before = sim.snapshot();
      expect(sim.throwBottle(100, 'mouse')).toBe(false);
      expect(sim.snapshot()).toEqual(before);
      run(sim, 15);

      // The same flight without the second throw attempt.
      const control = new Simulation({ seed: 1 });
      control.setWater(0.5);
      control.throwBottle(30);
      run(control, 30);
      expect(sim.snapshot()).toEqual(control.snapshot());
      expect(sim.snapshot().lastThrow).toEqual({ power: 30, water: 0.5, source: 'keyboard' });
    });

    it('keeps the water level fixed while flying', () => {
      const sim = thrown(0.5, 40);
      run(sim, 10);
      const before = sim.snapshot();
      sim.setWater(0.9);
      expect(sim.snapshot()).toEqual(before);
      run(sim, 5);
      expect(sim.snapshot().bottle.water).toBe(0.5);
    });

    it('does not move the bottle at all before the throw', () => {
      const sim = new Simulation({ seed: 5 });
      const start = sim.snapshot().bottle;
      run(sim, 120);
      // The held body may fall asleep while it waits; only its pose and velocity must not change.
      expect({ ...sim.snapshot().bottle, awake: true }).toEqual({ ...start, awake: true });
      expect(sim.snapshot().phase).toBe('aiming');
    });

    it('throws just as hard after the held bottle has waited long enough to fall asleep', () => {
      const waited = new Simulation({ seed: 6 });
      waited.setWater(0.5);
      run(waited, 600);
      waited.throwBottle(50);
      const immediate = launch(0.5, 50);
      const { bottle } = waited.snapshot();
      expect(bottle.awake).toBe(true);
      expect([bottle.vx, bottle.vy, bottle.omega]).toEqual([
        immediate.vx,
        immediate.vy,
        immediate.omega,
      ]);
      run(waited, 10);
      expect(waited.snapshot().bottle.y).toBeLessThan(HAND_Y - 0.5); // it rose from the hand
      expect(waited.snapshot().bottle.vy).toBeLessThan(0); // and is still rising
    });
  });

  describe('determinism', () => {
    it('gives identical snapshots for the same seed, tuning, water and power', () => {
      const make = () => {
        const sim = new Simulation({ seed: 9, tuning: { throwAngleDeg: 9, shellDensity: 0.4 } });
        sim.setWater(0.65);
        sim.throwBottle(57);
        run(sim, 300);
        return sim.snapshot();
      };
      expect(make()).toEqual(make());
    });

    it('gives different flights for different powers', () => {
      const a = thrown(0.5, 40);
      const b = thrown(0.5, 41);
      // Mid-flight: later, both have been replaced by the same next bottle from the same seed.
      run(a, 30);
      run(b, 30);
      expect(a.snapshot().bottle).not.toEqual(b.snapshot().bottle);
    });
  });
});

describe('throw tuning', () => {
  it('applies overrides given to the Simulation', () => {
    const normal = launch(0.5, 50);
    const stronger = launch(0.5, 50, {
      throwLinearImpulse: 2 * DEFAULT_TUNING.throwLinearImpulse,
      throwAngularImpulse: 2 * DEFAULT_TUNING.throwAngularImpulse,
    });
    expect(stronger.speed).toBeCloseTo(2 * normal.speed, 6);
    expect(stronger.omega).toBeCloseTo(2 * normal.omega, 6);
    expect(new Simulation({ tuning: { throwAngleDeg: 3 } }).tuning.throwAngleDeg).toBe(3);
  });

  it('turns the launch direction with throwAngleDeg', () => {
    const straight = launch(0.5, 50, { throwAngleDeg: 0 });
    expect(straight.vx).toBeCloseTo(0, 9);
    expect(straight.vy).toBeLessThan(0);
    const leaning = launch(0.5, 50, { throwAngleDeg: 8 });
    expect(Math.atan2(leaning.vx, -leaning.vy)).toBeCloseTo((8 * Math.PI) / 180, 9);
  });

  it('setTuning changes the throw of a bottle that is still held', () => {
    const sim = new Simulation({ seed: 1 });
    sim.setWater(0.5);
    sim.setTuning({ throwLinearImpulse: 2 * DEFAULT_TUNING.throwLinearImpulse });
    expect(sim.tuning.throwLinearImpulse).toBe(2 * DEFAULT_TUNING.throwLinearImpulse);
    expect(sim.tuning.throwAngleDeg).toBe(DEFAULT_TUNING.throwAngleDeg); // the rest is kept
    sim.throwBottle(50);
    expect(Math.hypot(sim.snapshot().bottle.vx, sim.snapshot().bottle.vy)).toBeCloseTo(
      2 * launch(0.5, 50).speed,
      6,
    );
  });

  it('setTuning changes the held bottle itself: a heavier shell launches slower', () => {
    const sim = new Simulation({ seed: 1 });
    sim.setWater(0.5);
    sim.setTuning({ shellDensity: 2 * DEFAULT_TUNING.shellDensity });
    sim.throwBottle(50);
    const heavy = sim.snapshot().bottle;
    expect(Math.hypot(heavy.vx, heavy.vy)).toBeLessThan(launch(0.5, 50).speed);
    expect(Math.hypot(heavy.vx, heavy.vy)).toBeCloseTo(
      launch(0.5, 50, { shellDensity: 2 * DEFAULT_TUNING.shellDensity }).speed,
      6,
    );
    expect(heavy.water).toBe(0.5); // the water level survives the rebuild
  });

  it('setTuning during a flight does not alter that flight', () => {
    const fly = (retune: boolean): SimSnapshot => {
      const sim = new Simulation({ seed: 4 });
      sim.setWater(0.6);
      sim.throwBottle(55);
      run(sim, 20);
      if (retune) {
        sim.setTuning({
          throwLinearImpulse: 100,
          throwAngularImpulse: 50,
          throwAngleDeg: 1,
          shellDensity: 5,
          waterDensity: 5,
          bottleFriction: 0,
          bottleRestitution: 1,
        });
      }
      run(sim, 280);
      return sim.snapshot();
    };
    expect(fly(true)).toEqual(fly(false));
  });

  it('setTuning during a flight still changes the tuning for later throws', () => {
    const sim = thrown(0.5, 50);
    sim.setTuning({ throwAngleDeg: 3 });
    expect(sim.tuning.throwAngleDeg).toBe(3);
  });
});
