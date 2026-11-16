import { describe, expect, it } from 'vitest';
import { SIM_HZ } from '../../src/core/constants';
import { PowerMeter, type PowerTuning } from '../../src/core/powerMeter';
import { DEFAULT_TUNING } from '../../src/core/tuning';

const tuning = (overrides: Partial<PowerTuning> = {}): PowerTuning => ({
  ...DEFAULT_TUNING,
  ...overrides,
});

const meter = (overrides: Partial<PowerTuning> = {}): PowerMeter => {
  const t = tuning(overrides);
  return new PowerMeter(() => t);
};

/** Hold `direction` for `seconds` of fixed steps and return the power after each step. */
function hold(m: PowerMeter, direction: 1 | -1, seconds: number): number[] {
  m.press(direction);
  const values: number[] = [];
  for (let i = 0; i < Math.round(seconds * SIM_HZ); i++) {
    m.step();
    values.push(m.value);
  }
  return values;
}

describe('PowerMeter', () => {
  it('starts at 50 by default, and at the tuning value otherwise (kept within 0..100)', () => {
    expect(DEFAULT_TUNING.powerStart).toBe(50);
    expect(meter().value).toBe(50);
    expect(meter({ powerStart: 20 }).value).toBe(20);
    expect(meter({ powerStart: 250 }).value).toBe(100);
    expect(meter({ powerStart: -5 }).value).toBe(0);
  });

  describe('taps', () => {
    it('moves one configured step per tap: up raises, down lowers', () => {
      const m = meter({ powerTapStep: 3 });
      m.press(1);
      expect(m.value).toBe(53);
      m.release(1);
      m.press(-1);
      expect(m.value).toBe(50);
      m.release(-1);
      m.press(-1);
      expect(m.value).toBe(47);
    });

    it('uses the default step of 1 point', () => {
      const m = meter();
      m.press(1);
      expect(m.value).toBe(50 + DEFAULT_TUNING.powerTapStep);
    });

    it('moves exactly one step when the key comes up before the hold delay', () => {
      const m = meter();
      m.press(1);
      const delaySteps = Math.round(DEFAULT_TUNING.powerHoldDelaySeconds * SIM_HZ);
      for (let i = 0; i < delaySteps; i++) m.step();
      expect(m.value).toBe(51);
      m.release(1);
      for (let i = 0; i < 120; i++) m.step();
      expect(m.value).toBe(51);
    });

    it('ignores a press of a key that is already held (an auto-repeat is not a second tap)', () => {
      const m = meter();
      m.press(1);
      m.press(1);
      m.press(1);
      expect(m.value).toBe(51);
    });

    it('stays within 0..100 however many taps there are', () => {
      const m = meter();
      for (let i = 0; i < 300; i++) {
        m.press(1);
        m.release(1);
      }
      expect(m.value).toBe(100);
      for (let i = 0; i < 300; i++) {
        m.press(-1);
        m.release(-1);
      }
      expect(m.value).toBe(0);
    });
  });

  describe('the mouse wheel', () => {
    it('moves one configured step per notch: positive raises, negative lowers', () => {
      const m = meter({ powerWheelStep: 4 });
      m.wheel(1);
      expect(m.value).toBe(54);
      m.wheel(-1);
      m.wheel(-1);
      expect(m.value).toBe(46);
      m.wheel(3);
      expect(m.value).toBe(58);
    });

    it('uses the default wheel step', () => {
      const m = meter();
      m.wheel(1);
      expect(m.value).toBe(50 + DEFAULT_TUNING.powerWheelStep);
    });

    it('stays within 0..100 and ignores a notch count that is not a number', () => {
      const m = meter();
      m.wheel(1000);
      expect(m.value).toBe(100);
      m.wheel(-1000);
      expect(m.value).toBe(0);
      m.wheel(Number.NaN);
      m.wheel(Infinity);
      expect(m.value).toBe(0);
    });
  });

  describe('holding a key', () => {
    it('moves farther in 1 s than 10 taps do', () => {
      const tapped = meter();
      for (let i = 0; i < 10; i++) {
        tapped.press(1);
        tapped.release(1);
      }
      const held = meter();
      hold(held, 1, 1);
      expect(held.value - 50).toBeGreaterThan(tapped.value - 50);
      expect(held.value - 50).toBeGreaterThan(10);

      const heldDown = meter();
      hold(heldDown, -1, 1);
      expect(50 - heldDown.value).toBeGreaterThan(10);
    });

    it('moves faster after 1 s than at the start of the movement', () => {
      const m = meter();
      const values = hold(m, 1, 2);
      const delaySteps = Math.round(DEFAULT_TUNING.powerHoldDelaySeconds * SIM_HZ);
      // Points gained in one step: the first step that moves, and a step a second into the hold.
      const gained = (step: number): number => values[step] - values[step - 1];
      const atStart = gained(delaySteps); // the first moving step (index delaySteps, 0-based)
      const afterOneSecond = gained(SIM_HZ);
      expect(atStart).toBeGreaterThan(0);
      expect(afterOneSecond).toBeGreaterThan(atStart);
    });

    it('never slows down, and tops out at the maximum rate', () => {
      const m = meter();
      const values = hold(m, 1, 0.9);
      const gains = values.slice(1).map((v, i) => v - values[i]);
      for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeGreaterThanOrEqual(gains[i - 1]);

      const slow = meter({
        powerStart: 0,
        powerHoldRateStart: 10,
        powerHoldRateMax: 30,
        powerHoldRampSeconds: 1,
      });
      const long = hold(slow, 1, 3);
      const last = long[long.length - 1] - long[long.length - 2];
      expect(last).toBeCloseTo(30 / SIM_HZ, 9);
    });

    it('starts at the configured rate once the hold delay has passed', () => {
      const m = meter({
        powerHoldDelaySeconds: 0.5,
        powerHoldRateStart: 30,
        powerHoldRampSeconds: 100,
      });
      m.press(1);
      for (let i = 0; i < 30; i++) m.step(); // the whole delay: nothing moves yet
      expect(m.value).toBe(51);
      m.step();
      expect(m.value - 51).toBeCloseTo(30 / SIM_HZ, 2); // the ramp is slow, so ~ the start rate
    });

    it('stops when the key comes up, and holds the value', () => {
      const m = meter();
      hold(m, 1, 1);
      m.release(1);
      const stopped = m.value;
      for (let i = 0; i < 120; i++) m.step();
      expect(m.value).toBe(stopped);
    });

    it('stays within 0..100 however long a key is held', () => {
      const m = meter();
      for (const v of hold(m, 1, 20)) {
        expect(v).toBeLessThanOrEqual(100);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(m.value).toBe(100);
      m.release();
      for (const v of hold(m, -1, 20)) {
        expect(v).toBeLessThanOrEqual(100);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(m.value).toBe(0);
    });

    it('lets the newest key win, and the older one take over again from its delay', () => {
      const m = meter({ powerStart: 50, powerHoldDelaySeconds: 0.1 });
      m.press(1); // 51
      for (let i = 0; i < 30; i++) m.step();
      const raised = m.value;
      expect(raised).toBeGreaterThan(55);

      m.press(-1); // down wins at once: one tap down, then it holds down
      expect(m.value).toBe(raised - 1);
      for (let i = 0; i < 30; i++) m.step();
      expect(m.value).toBeLessThan(raised - 5);

      m.release(-1); // Up is still down: it takes over, after its delay
      const afterDown = m.value;
      m.step();
      expect(m.value).toBe(afterDown); // inside the delay again
      for (let i = 0; i < 30; i++) m.step();
      expect(m.value).toBeGreaterThan(afterDown);

      m.release(1);
      const still = m.value;
      m.step();
      expect(m.value).toBe(still);
    });

    it('release() with no argument lets go of every key', () => {
      const m = meter();
      m.press(1);
      m.press(-1);
      m.release();
      const at = m.value;
      for (let i = 0; i < 60; i++) m.step();
      expect(m.value).toBe(at);
    });

    it('releasing a key that was not held changes nothing', () => {
      const m = meter({ powerHoldDelaySeconds: 0.1 });
      m.press(1);
      for (let i = 0; i < 10; i++) m.step();
      const twin = meter({ powerHoldDelaySeconds: 0.1 });
      twin.press(1);
      for (let i = 0; i < 10; i++) twin.step();
      m.release(-1);
      for (let i = 0; i < 20; i++) {
        m.step();
        twin.step();
      }
      expect(m.value).toBe(twin.value);
    });
  });

  describe('set()', () => {
    it('sets the value, clamped to 0..100, and ignores a non-number', () => {
      const m = meter();
      m.set(20);
      expect(m.value).toBe(20);
      m.set(250);
      expect(m.value).toBe(100);
      m.set(-3);
      expect(m.value).toBe(0);
      m.set(64.5);
      m.set(Number.NaN);
      expect(m.value).toBe(64.5);
    });
  });

  it('reads the tuning on every use, so a change applies at once', () => {
    let t = tuning({ powerTapStep: 1 });
    const m = new PowerMeter(() => t);
    m.press(1);
    expect(m.value).toBe(51);
    m.release(1);
    t = { ...t, powerTapStep: 7 };
    m.press(1);
    expect(m.value).toBe(58);
  });

  it('is deterministic: the same inputs on the same steps give the same value', () => {
    const run = (): number[] => {
      const m = meter();
      const out: number[] = [];
      for (let i = 0; i < 400; i++) {
        if (i === 10) m.press(1);
        if (i === 90) m.release(1);
        if (i === 100) m.wheel(-3);
        if (i === 150) m.press(-1);
        if (i === 300) m.release(-1);
        m.step();
        out.push(m.value);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
